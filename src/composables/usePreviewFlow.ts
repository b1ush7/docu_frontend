/**
 * @file 右侧主内容区预览流程编排
 * @description 管理「目标要求提交 → 生成待确认修改计划 → 用户确认 → 读取输出版本结构 → 文稿预览」的完整链路。
 *
 * 与旧实现的区别（对应后端 API.md 第 8 节）：
 *   旧实现走 `POST /task` 创建 `AI_EDIT` 异步任务并轮询任务详情。后端的
 *   `CreateTaskDTO.taskType` 已收窄为 `^(CONVERT|EXPORT)$`，`AI_EDIT` 不再允许新建，
 *   因此改为「AI 会话 + 待确认计划」：
 *     POST /ai/sessions                       建立会话并绑定文件
 *     POST /ai/sessions/{id}/replies          生成回复与待确认计划（同步返回）
 *     GET  /ai/sessions/{id}/replies/{msgId}  runStatus=RUNNING 时轮询
 *     POST /ai/sessions/{id}/replies/{msgId}/confirm  确认后才落新版本
 *
 * 关键语义（容易搞错）：
 *   - `runStatus` 表示「模型是否跑完」，`planStatus` 表示「修改是否已落版本」，
 *     两者必须分开判断：只有 `planStatus=CONFIRMED` 才有 `outputVersion`。
 *   - HTTP 成功不代表模型执行成功，必须检查 `runStatus`。
 *   - 确认时服务端使用会话绑定的文件与保存的 `sourceVersion`，
 *     源版本过期会返回 409，此时应放弃旧计划并用新幂等键重新发送。
 *
 * 说明：`activeTask` 是为既有 PreviewPanel 保留的**展示用视图模型**，
 *       由 AI 回复映射而来，不是真实任务记录。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { aiApi } from '@/api/ai'
import { fileApi } from '@/api/file'
import { docxApi } from '@/api/docx'
import { ApiError } from '@/api/http'
import type { AiChange, AiPlanStatus, AiReply, DocxStructure, Task, TaskStatus } from '@/api/types'

/** usePreviewFlow 对外钩子 */
interface UsePreviewFlowHooks {
  /**
   * 确认生成完成后的回调：父组件借此刷新文件列表等外部状态
   * @param task 展示用视图模型（其 outputVersion 即确认保留的版本）
   */
  onConfirmed: (task: Task) => void
}

/** 主内容区当前所处状态：upload 上传与目标要求输入 / preview 生成中或文稿预览 */
export type PreviewMode = 'upload' | 'preview'

/** 轮询间隔毫秒数：AI 回复通常比异步任务快，取 2 秒 */
const POLL_INTERVAL_MS = 2000

/**
 * 创建预览流程状态（页面级持有，当前仅 WorkspaceView 使用）
 * @param hooks 对外回调钩子
 * @returns 预览流程状态与操作方法
 */
export function usePreviewFlow(hooks: UsePreviewFlowHooks) {
  /** 主内容区当前状态 */
  const mode = ref<PreviewMode>('upload')

  /** 展示用视图模型（不是真实任务记录，仅用于兼容既有面板） */
  const activeTask = ref<Task | null>(null)

  /** 最近一次 AI 回复（含 runStatus / planStatus / changes） */
  const reply = ref<AiReply | null>(null)

  /** 待确认的内容差异（仅 planStatus=PENDING 时非空） */
  const changes = computed<AiChange[]>(() => reply.value?.changes ?? [])

  /** 待确认计划状态 */
  const planStatus = computed<AiPlanStatus>(() => reply.value?.planStatus ?? 'NONE')

  /** 任务成功后读取的输出版本 DOCX 结构 */
  const structure = ref<DocxStructure | null>(null)

  /** 结构加载中标记 */
  const structureLoading = ref(false)

  /** 结构加载失败提示（生成成功但读取结构失败时展示） */
  const structureError = ref('')

  /** 轮询定时器句柄；null 表示无进行中的轮询 */
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  /** 会话缓存：同一文件复用同一会话，避免每次提交都新建 */
  let sessionId: number | null = null
  let sessionFileId: number | null = null

  /** 本次流程的上下文，供轮询与确认使用 */
  let currentFileId: number | null = null
  let currentInstruction = ''

  /** 模型是否仍在生成 */
  const isGenerating = computed(() => reply.value?.runStatus === 'RUNNING')

  /** 生成是否失败 */
  const isFailed = computed(() => reply.value?.runStatus === 'FAILED')

  /** 是否可以确认：只有存在待确认计划时才可确认 */
  const canConfirm = computed(() => reply.value?.planStatus === 'PENDING')

  /**
   * 把 AI 回复映射为展示用任务视图模型
   * @param r AI 回复
   * @param fileId 关联文件
   * @param instruction 用户指令
   */
  function toDisplayTask(r: AiReply, fileId: number, instruction: string): Task {
    const running = r.runStatus === 'RUNNING'
    const failed = r.runStatus === 'FAILED'
    const status: TaskStatus = failed ? 'FAILED' : running ? 'RUNNING' : 'SUCCEEDED'
    return {
      id: r.message.id,
      fileId,
      // 展示层面沿用 AI_EDIT 语义（该值只用于面板显示，不会再回传给 /task）
      taskType: 'AI_EDIT',
      status,
      progress: failed ? 0 : running ? 50 : 100,
      currentStep: running ? '正在生成修改计划' : failed ? '生成失败' : null,
      instruction,
      errorCode: null,
      errorMessage: failed ? (r.result?.reply || '生成失败，请重试') : null,
      inputVersion: r.sourceVersion,
      outputVersion: r.outputVersion,
      retryCount: 0,
      maxRetry: 0,
      cancelRequested: false,
      createTime: new Date().toISOString(),
      startTime: null,
      finishTime: null,
      elapsedMs: r.result?.usage?.elapsedMs ?? null,
    }
  }

  /** 取得或创建与文件绑定的会话 */
  async function ensureSession(fileId: number): Promise<number> {
    if (sessionId !== null && sessionFileId === fileId) {
      return sessionId
    }
    const session = await aiApi.createSession({ title: '工作台编辑', fileId })
    sessionId = session.id
    sessionFileId = fileId
    return session.id
  }

  /** 应用一次回复结果，并按状态分流 */
  async function applyReply(r: AiReply, fileId: number): Promise<void> {
    reply.value = r
    activeTask.value = toDisplayTask(r, fileId, currentInstruction)

    if (r.runStatus === 'RUNNING') {
      schedulePoll()
      return
    }
    stopPolling()

    // 只有已确认的计划才有产出版本，此时才读取结构用于预览
    if (r.planStatus === 'CONFIRMED' && r.outputVersion !== null) {
      await loadStructure(fileId, r.outputVersion)
    }
  }

  /**
   * 读取指定版本的 DOCX 结构
   * @param fileId 文件 ID
   * @param versionNo 明确的版本号（不要用「最新版本」）
   */
  async function loadStructure(fileId: number, versionNo: number): Promise<void> {
    structureLoading.value = true
    structureError.value = ''
    try {
      structure.value = await docxApi.getStructure(fileId, versionNo)
    } catch (e) {
      structureError.value = e instanceof ApiError ? e.message : '文稿结构加载失败'
    } finally {
      structureLoading.value = false
    }
  }

  /**
   * 提交目标要求：生成待确认的修改计划
   * @param fileId 目标文件 ID
   * @param instruction 用户输入的编辑指令
   */
  async function submit(fileId: number, instruction: string): Promise<void> {
    stopPolling()
    structure.value = null
    structureError.value = ''
    reply.value = null
    currentFileId = fileId
    currentInstruction = instruction
    mode.value = 'preview'
    // 先生成一个「生成中」的展示态，等回复返回后再用真实数据覆盖
    activeTask.value = {
      id: 0,
      fileId,
      taskType: 'AI_EDIT',
      status: 'RUNNING',
      progress: 10,
      currentStep: '正在生成修改计划',
      instruction,
      errorCode: null,
      errorMessage: null,
      inputVersion: null,
      outputVersion: null,
      retryCount: 0,
      maxRetry: 0,
      cancelRequested: false,
      createTime: new Date().toISOString(),
      startTime: null,
      finishTime: null,
      elapsedMs: null,
    }

    try {
      const sid = await ensureSession(fileId)
      // 后端要求绑定文件时传明确版本号：取文件当前最新版本
      const file = await fileApi.detail(fileId)
      const r = await aiApi.generateReply(sid, {
        content: instruction,
        versionNo: file.latestVersion,
        // 一次发送意图对应一个稳定键；本流程每次提交即一次新意图
        idempotencyKey: createIdempotencyKey(),
      })
      await applyReply(r, fileId)
    } catch (e) {
      stopPolling()
      const message = e instanceof ApiError ? e.message : '生成修改计划失败'
      structureError.value = message
      if (activeTask.value !== null) {
        activeTask.value = {
          ...activeTask.value,
          status: 'FAILED',
          progress: 0,
          currentStep: '生成失败',
          errorMessage: message,
        }
      }
    }
  }

  /** 生成幂等键（32 位十六进制，满足后端 128 字符上限） */
  function createIdempotencyKey(): string {
    try {
      return crypto.randomUUID().replace(/-/g, '')
    } catch {
      return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
    }
  }

  /** 安排下一轮回复轮询（仅 RUNNING 时需要） */
  function schedulePoll(): void {
    stopPolling()
    pollTimer = setTimeout(() => {
      void pollOnce()
    }, POLL_INTERVAL_MS)
  }

  /** 停止轮询 */
  function stopPolling(): void {
    if (pollTimer !== null) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  /** 单次轮询：查询回复进度 */
  async function pollOnce(): Promise<void> {
    const current = reply.value
    const fileId = currentFileId
    if (!current || fileId === null || sessionId === null) {
      return
    }
    try {
      const r = await aiApi.getReply(sessionId, current.message.id)
      await applyReply(r, fileId)
    } catch {
      // 单次轮询失败不终止流程：网络抖动时继续下一轮
      schedulePoll()
    }
  }

  /**
   * 返回修改：回到目标要求输入态（草稿由输入组件 v-show 保活天然保留）。
   * 待确认计划仍在服务端保留，用户可再次提交新要求；旧计划可调用 discard 放弃。
   */
  function back(): void {
    stopPolling()
    mode.value = 'upload'
  }

  /**
   * 确认生成：把待确认计划落到新版本，成功后读取输出版本结构。
   * 源版本已被其他操作推进时后端返回 409，此时应放弃旧计划并用新键重新发送。
   */
  async function confirm(): Promise<void> {
    const current = reply.value
    const fileId = currentFileId
    if (!current || fileId === null || sessionId === null || !canConfirm.value) {
      return
    }
    try {
      const r = await aiApi.confirmReply(sessionId, current.message.id)
      await applyReply(r, fileId)
      if (r.outputVersion !== null) {
        stopPolling()
        mode.value = 'upload'
        if (activeTask.value) {
          hooks.onConfirmed(activeTask.value)
        }
      }
    } catch (e) {
      structureError.value = e instanceof ApiError ? e.message : '确认失败，请稍后重试'
    }
  }

  /** 放弃待确认计划：不生成版本；已确认的计划不能再放弃 */
  async function discard(): Promise<void> {
    const current = reply.value
    if (!current || sessionId === null || current.planStatus !== 'PENDING') {
      return
    }
    try {
      const r = await aiApi.discardReply(sessionId, current.message.id)
      reply.value = r
      if (activeTask.value) {
        activeTask.value = { ...activeTask.value, currentStep: '已放弃本次修改' }
      }
    } catch (e) {
      structureError.value = e instanceof ApiError ? e.message : '放弃失败，请稍后重试'
    }
  }

  // 组件卸载时清理轮询定时器
  onBeforeUnmount(() => {
    stopPolling()
  })

  return {
    mode,
    activeTask,
    reply,
    changes,
    planStatus,
    structure,
    structureLoading,
    structureError,
    isGenerating,
    isFailed,
    canConfirm,
    submit,
    back,
    confirm,
    discard,
  }
}
