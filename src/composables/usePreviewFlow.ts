/** AI replies are pending plans; only confirmation creates a document version. */
import { computed, onBeforeUnmount, ref } from 'vue'
import { aiApi } from '@/api/ai'
import { fileApi } from '@/api/file'
import { docxApi } from '@/api/docx'
import { ApiError } from '@/api/http'
import type { AiChange, AiPlanStatus, AiReply, AiReplyRequest, AiSession, DocxStructure, Task } from '@/api/types'

interface UsePreviewFlowHooks {
  onConfirmed: (task: Task) => void
  onReplySaved?: (sessionId: number, messageId: number, fileId: number | null) => void
  onContextCleared?: () => void
}
export type PreviewMode = 'upload' | 'preview'
export interface PreviewVersion { fileId: number; versionNo: number; extension: string }
export function usePreviewFlow(hooks: UsePreviewFlowHooks) {
  const mode = ref<PreviewMode>('upload')
  const activeTask = ref<Task | null>(null)
  const reply = ref<AiReply | null>(null)
  const changes = computed<AiChange[]>(() => reply.value?.changes ?? [])
  const planStatus = computed<AiPlanStatus>(() => reply.value?.planStatus ?? 'NONE')
  const structure = ref<DocxStructure | null>(null)
  const previewVersion = ref<PreviewVersion | null>(null)
  const structureLoading = ref(false)
  const structureError = ref('')
  const submitting = ref(false)
  const mutating = ref(false)
  const conflict = ref(false)
  const restoring = ref(false)
  const sessionArchived = ref(false)
  const isGenerating = computed(() => submitting.value
    || (reply.value?.runStatus === 'RUNNING' && activeTask.value?.status !== 'FAILED'))
  const isFailed = computed(() => activeTask.value?.status === 'FAILED')
  const busy = computed(() => isGenerating.value || mutating.value || restoring.value || structureLoading.value)
  const canConfirm = computed(() => !busy.value && !conflict.value && !sessionArchived.value
    && reply.value?.runStatus === 'COMPLETED' && reply.value?.planStatus === 'PENDING'
    && changes.value.length > 0)
  const canDiscard = computed(() => !busy.value && !sessionArchived.value && reply.value?.planStatus === 'PENDING')
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let sessionId: number | null = null
  let sessionFileId: number | null = null
  let currentFileId: number | null = null
  let currentInstruction = ''
  let disposed = false
  let revision = 0
  // Reuse exactly the same payload/key after a transport timeout. The server may have saved the reply.
  let retryIntent: { fileId: number; instruction: string; sessionId: number; body: AiReplyRequest } | null = null

  function displayTask(r: AiReply | null, fileId: number | null): Task {
    const running = !r || r.runStatus === 'RUNNING'
    const failed = r?.runStatus === 'FAILED'
    return {
      id: r?.message.id ?? 0, fileId, taskType: 'AI_EDIT',
      status: failed ? 'FAILED' : running ? 'RUNNING' : 'SUCCEEDED',
      progress: failed ? 0 : running ? 50 : 100,
      currentStep: running ? '正在生成修改计划' : null, instruction: currentInstruction,
      errorCode: null, errorMessage: failed ? r?.result?.reply || '生成失败，请重试' : null,
      inputVersion: r?.sourceVersion ?? null, outputVersion: r?.outputVersion ?? null,
      retryCount: 0, maxRetry: 0, cancelRequested: false, createTime: new Date().toISOString(),
      startTime: null, finishTime: null, elapsedMs: r?.result?.usage?.elapsedMs ?? null,
    }
  }
  function stopPolling(): void {
    if (pollTimer !== null) clearTimeout(pollTimer)
    pollTimer = null
  }
  function schedulePoll(): void {
    stopPolling()
    if (!disposed) pollTimer = setTimeout(() => { void pollOnce() }, 2000)
  }
  async function loadVersion(fileId: number, versionNo: number, request = revision): Promise<void> {
    structureLoading.value = true
    structure.value = null
    previewVersion.value = null
    structureError.value = ''
    try {
      const version = await fileApi.versionDetail(fileId, versionNo)
      if (disposed || request !== revision) return
      previewVersion.value = { fileId, versionNo, extension: version.extension.toLowerCase() }
      // XLSX/PDF/images use the general page preview endpoint; do not call the DOCX-only endpoint.
      if (version.extension.toLowerCase() === 'docx') {
        const result = await docxApi.getStructure(fileId, versionNo)
        if (!disposed && request === revision) structure.value = result
      }
    } catch (error) {
      if (!disposed && request === revision) structureError.value = error instanceof ApiError ? error.message : '文稿加载失败'
    } finally { if (request === revision) structureLoading.value = false }
  }
  async function applyReply(r: AiReply, fileId: number | null, request = revision): Promise<void> {
    if (disposed || request !== revision) return
    reply.value = r
    activeTask.value = displayTask(r, fileId)
    if (sessionId !== null) hooks.onReplySaved?.(sessionId, r.message.id, fileId)
    if (r.runStatus === 'RUNNING') { schedulePoll(); return }
    stopPolling()
    if (fileId !== null && r.planStatus === 'CONFIRMED' && r.outputVersion !== null) {
      await loadVersion(fileId, r.outputVersion, request)
    }
  }
  async function submit(fileId: number, instruction: string): Promise<void> {
    if (busy.value || disposed) return
    stopPolling()
    const request = ++revision
    submitting.value = true
    structure.value = null
    previewVersion.value = null
    structureError.value = ''
    conflict.value = false
    reply.value = null
    currentFileId = fileId
    currentInstruction = instruction
    mode.value = 'preview'
    activeTask.value = displayTask(null, fileId)
    try {
      if (!retryIntent || retryIntent.fileId !== fileId || retryIntent.instruction !== instruction) {
        if (sessionId === null || sessionFileId !== fileId || sessionArchived.value) {
          const session = await aiApi.createSession({ title: '工作台编辑', fileId })
          sessionId = session.id
          sessionFileId = fileId
          sessionArchived.value = false
        }
        const file = await fileApi.detail(fileId)
        retryIntent = {
          fileId, instruction, sessionId,
          body: { content: instruction, versionNo: file.latestVersion,
            idempotencyKey: globalThis.crypto?.randomUUID?.()
              ?? `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}` },
        }
      }
      sessionId = retryIntent.sessionId
      const r = await aiApi.generateReply(retryIntent.sessionId, retryIntent.body)
      retryIntent = null
      await applyReply(r, fileId, request)
    } catch (error) {
      if (error instanceof ApiError && error.code >= 400 && error.code < 500) retryIntent = null
      structureError.value = error instanceof ApiError ? error.message : '生成修改计划失败'
      if (activeTask.value) activeTask.value = { ...activeTask.value, status: 'FAILED', progress: 0,
        currentStep: '生成失败', errorMessage: structureError.value }
    } finally { submitting.value = false }
  }
  async function pollOnce(): Promise<void> {
    if (!reply.value || sessionId === null || disposed) return
    const request = revision
    const fileId = currentFileId
    const sid = sessionId
    const messageId = reply.value.message.id
    try {
      await applyReply(await aiApi.getReply(sid, messageId), fileId, request)
    } catch (error) {
      if (disposed || request !== revision) return
      structureError.value = error instanceof ApiError ? error.message : '回复查询失败'
      if (!(error instanceof ApiError) || ![401, 403, 404].includes(error.code)) schedulePoll()
      else if (activeTask.value) activeTask.value = { ...activeTask.value, status: 'FAILED', errorMessage: structureError.value }
    }
  }
  function back(): void {
    if (busy.value) return
    stopPolling()
    mode.value = 'upload'
  }
  async function confirm(): Promise<void> {
    if (!canConfirm.value || !reply.value || currentFileId === null || sessionId === null) return
    mutating.value = true
    structureError.value = ''
    try {
      const r = await aiApi.confirmReply(sessionId, reply.value.message.id)
      await applyReply(r, currentFileId)
      // Keep the confirmed version visible for layout checks, comparison and export.
      if (r.planStatus === 'CONFIRMED' && r.outputVersion !== null && activeTask.value) hooks.onConfirmed(activeTask.value)
    } catch (error) {
      conflict.value = error instanceof ApiError && error.code === 409
      structureError.value = conflict.value
        ? '源版本或计划状态已变化。请放弃本次计划，返回后重新生成。'
        : error instanceof ApiError ? error.message : '确认失败，请稍后重试'
    } finally { mutating.value = false }
  }
  async function discard(): Promise<void> {
    if (!canDiscard.value || !reply.value || sessionId === null) return
    mutating.value = true
    structureError.value = ''
    try {
      reply.value = await aiApi.discardReply(sessionId, reply.value.message.id)
      conflict.value = false
      if (activeTask.value) activeTask.value = { ...activeTask.value, currentStep: '已放弃本次修改' }
    } catch (error) { structureError.value = error instanceof ApiError ? error.message : '放弃失败，请稍后重试' }
    finally { mutating.value = false }
  }

  function clearContext(): void {
    revision++
    stopPolling()
    reply.value = null
    activeTask.value = null
    structure.value = null
    previewVersion.value = null
    structureError.value = ''
    conflict.value = false
    retryIntent = null
    currentFileId = null
    currentInstruction = ''
    sessionId = null
    sessionFileId = null
    sessionArchived.value = false
  }
  function reset(): void {
    if (busy.value) return
    clearContext()
    mode.value = 'upload'
    hooks.onContextCleared?.()
  }
  async function openVersion(fileId: number, versionNo: number): Promise<void> {
    if (busy.value || disposed) return
    clearContext()
    currentFileId = fileId
    mode.value = 'preview'
    hooks.onContextCleared?.()
    await loadVersion(fileId, versionNo)
  }
  async function restoreReply(sid: number, messageId: number): Promise<AiSession | null> {
    if (busy.value || disposed) return null
    clearContext()
    const request = revision
    restoring.value = true
    mode.value = 'preview'
    try {
      const [session, r] = await Promise.all([aiApi.getSession(sid), aiApi.getReply(sid, messageId)])
      if (disposed || request !== revision) return null
      sessionId = session.id
      sessionFileId = session.fileId
      currentFileId = session.fileId
      sessionArchived.value = session.status === 'ARCHIVED'
      currentInstruction = '恢复的会话回复'
      await applyReply(r, session.fileId, request)
      return session
    } catch (error) {
      if (!disposed && request === revision) structureError.value = error instanceof ApiError ? error.message : '会话恢复失败'
      throw error
    } finally { if (request === revision) restoring.value = false }
  }
  onBeforeUnmount(() => { disposed = true; revision++; stopPolling() })
  return { mode, activeTask, reply, changes, planStatus, structure, previewVersion, structureLoading,
    structureError, isGenerating, isFailed, busy, canConfirm, canDiscard, sessionArchived,
    submit, back, confirm, discard, openVersion, restoreReply, reset }
}
