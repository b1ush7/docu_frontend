/** AI replies are pending plans; only confirmation creates a document version. */
import { computed, onBeforeUnmount, ref } from 'vue'
import { aiApi } from '@/api/ai'
import { fileApi } from '@/api/file'
import { docxApi } from '@/api/docx'
import { ApiError } from '@/api/http'
import type { AiChange, AiPlanStatus, AiReply, AiReplyRequest, DocxStructure, Task } from '@/api/types'

interface UsePreviewFlowHooks { onConfirmed: (task: Task) => void }
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
  const isGenerating = computed(() => submitting.value
    || (reply.value?.runStatus === 'RUNNING' && activeTask.value?.status !== 'FAILED'))
  const isFailed = computed(() => activeTask.value?.status === 'FAILED')
  const busy = computed(() => isGenerating.value || mutating.value)
  const canConfirm = computed(() => !busy.value && !conflict.value
    && reply.value?.runStatus === 'COMPLETED' && reply.value?.planStatus === 'PENDING'
    && changes.value.length > 0)
  const canDiscard = computed(() => !busy.value && reply.value?.planStatus === 'PENDING')
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let sessionId: number | null = null
  let sessionFileId: number | null = null
  let currentFileId: number | null = null
  let currentInstruction = ''
  let disposed = false
  // Reuse exactly the same payload/key after a transport timeout. The server may have saved the reply.
  let retryIntent: { fileId: number; instruction: string; sessionId: number; body: AiReplyRequest } | null = null

  function displayTask(r: AiReply | null, fileId: number): Task {
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
  async function loadVersion(fileId: number, versionNo: number): Promise<void> {
    structureLoading.value = true
    structure.value = null
    structureError.value = ''
    try {
      const version = await fileApi.versionDetail(fileId, versionNo)
      if (disposed) return
      previewVersion.value = { fileId, versionNo, extension: version.extension.toLowerCase() }
      // XLSX/PDF/images use the general page preview endpoint; do not call the DOCX-only endpoint.
      if (version.extension.toLowerCase() === 'docx') {
        structure.value = await docxApi.getStructure(fileId, versionNo)
      }
    } catch (error) {
      structureError.value = error instanceof ApiError ? error.message : '文稿加载失败'
    } finally { structureLoading.value = false }
  }
  async function applyReply(r: AiReply, fileId: number): Promise<void> {
    if (disposed) return
    reply.value = r
    activeTask.value = displayTask(r, fileId)
    if (r.runStatus === 'RUNNING') { schedulePoll(); return }
    stopPolling()
    if (r.planStatus === 'CONFIRMED' && r.outputVersion !== null) {
      await loadVersion(fileId, r.outputVersion)
    }
  }
  async function submit(fileId: number, instruction: string): Promise<void> {
    if (busy.value || disposed) return
    stopPolling()
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
        if (sessionId === null || sessionFileId !== fileId) {
          const session = await aiApi.createSession({ title: '工作台编辑', fileId })
          sessionId = session.id
          sessionFileId = fileId
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
      await applyReply(r, fileId)
    } catch (error) {
      if (error instanceof ApiError && error.code >= 400 && error.code < 500) retryIntent = null
      structureError.value = error instanceof ApiError ? error.message : '生成修改计划失败'
      if (activeTask.value) activeTask.value = { ...activeTask.value, status: 'FAILED', progress: 0,
        currentStep: '生成失败', errorMessage: structureError.value }
    } finally { submitting.value = false }
  }
  async function pollOnce(): Promise<void> {
    if (!reply.value || currentFileId === null || sessionId === null || disposed) return
    try {
      await applyReply(await aiApi.getReply(sessionId, reply.value.message.id), currentFileId)
      structureError.value = ''
    } catch (error) {
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
  onBeforeUnmount(() => { disposed = true; stopPolling() })
  return { mode, activeTask, reply, changes, planStatus, structure, previewVersion, structureLoading,
    structureError, isGenerating, isFailed, busy, canConfirm, canDiscard, submit, back, confirm, discard }
}
