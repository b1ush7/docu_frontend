/**
 * @file 右侧主内容区预览流程编排
 * @description 管理"目标要求提交 → 创建 AI_EDIT 任务 → 轮询任务详情 → 读取输出版本结构 → 文稿预览"的完整链路，
 *              以及"返回修改 / 确认生成"两个出口。
 *              说明：后端无 SSE 推送，生成过程通过轮询任务详情驱动；
 *              AI_EDIT 成功时服务端已自动落库新版本（outputVersion），
 *              "确认生成"在前端侧即完成确认并回到上传态，版本确认弹窗接入后可在此扩展钩子。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { taskApi } from '@/api/task'
import { docxApi } from '@/api/docx'
import { ApiError } from '@/api/http'
import type { DocxStructure, Task } from '@/api/types'

/** usePreviewFlow 对外钩子 */
interface UsePreviewFlowHooks {
  /**
   * 确认生成完成后的回调：父组件借此刷新文件列表等外部状态
   * @param task 被确认的任务（其 outputVersion 即确认保留的版本）
   */
  onConfirmed: (task: Task) => void
}

/** 主内容区当前所处状态：upload 上传与目标要求输入 / preview 生成中或文稿预览 */
export type PreviewMode = 'upload' | 'preview'

/** 轮询间隔毫秒数：与任务详情分区保持一致的折中值 */
const POLL_INTERVAL_MS = 3000

/**
 * 创建预览流程状态（页面级持有，当前仅 WorkspaceView 使用）
 * @param hooks 对外回调钩子
 * @returns 预览流程状态与操作方法
 */
export function usePreviewFlow(hooks: UsePreviewFlowHooks) {
  /** 主内容区当前状态 */
  const mode = ref<PreviewMode>('upload')

  /** 生成预览对应的任务记录（生成中轮询更新，成功后保留用于展示版本来源） */
  const activeTask = ref<Task | null>(null)

  /** 任务成功后读取的输出版本 DOCX 结构 */
  const structure = ref<DocxStructure | null>(null)

  /** 结构加载中标记 */
  const structureLoading = ref(false)

  /** 结构加载失败提示（任务成功但读取结构失败时展示） */
  const structureError = ref('')

  /** 轮询定时器句柄；null 表示无进行中的轮询 */
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  /** 任务是否处于生成中（排队 / 执行） */
  const isGenerating = computed(
    () =>
      activeTask.value !== null &&
      (activeTask.value.status === 'PENDING' || activeTask.value.status === 'RUNNING'),
  )

  /** 任务是否已失败或被取消：预览区展示错误信息，隐藏"确认生成" */
  const isFailed = computed(
    () =>
      activeTask.value !== null &&
      (activeTask.value.status === 'FAILED' || activeTask.value.status === 'CANCELLED'),
  )

  /** 任务是否成功且结构就绪：可执行"确认生成" */
  const canConfirm = computed(
    () =>
      activeTask.value !== null &&
      activeTask.value.status === 'SUCCEEDED' &&
      structure.value !== null &&
      !structureLoading.value,
  )

  /**
   * 停止任务轮询：清理定时器并置空句柄
   */
  function stopPolling(): void {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  /**
   * 读取任务输出版本的 DOCX 结构（仅 AI_EDIT 成功且关联文件时调用）
   * @param task 已成功的任务记录
   */
  async function loadStructure(task: Task): Promise<void> {
    // 无关联文件或无输出版本时无法读取结构，展示错误提示
    if (task.fileId === null || task.outputVersion === null) {
      structureError.value = '任务未产出可预览的文档版本'
      return
    }
    structureLoading.value = true
    structureError.value = ''
    try {
      structure.value = await docxApi.getStructure(task.fileId, task.outputVersion)
    } catch (e) {
      // 结构读取失败：预览区提示错误，用户仍可返回修改
      structureError.value = e instanceof ApiError ? e.message : '文稿结构加载失败'
    } finally {
      structureLoading.value = false
    }
  }

  /**
   * 提交目标要求：创建 AI_EDIT 任务并进入预览态开始轮询
   * @param fileId 目标文件 ID
   * @param instruction 用户输入的编辑指令
   */
  async function submit(fileId: number, instruction: string): Promise<void> {
    stopPolling()
    structure.value = null
    structureError.value = ''
    try {
      // 创建 AI_EDIT 任务；成功后进入预览态，由轮询驱动进度展示
      const task = await taskApi.create({
        taskType: 'AI_EDIT',
        fileId,
        instruction,
      })
      activeTask.value = task
      mode.value = 'preview'
      schedulePoll()
    } catch {
      // 创建失败：保留在输入态，错误经 ApiError 已由 http 层弹出提示，这里不重复展示
      activeTask.value = null
    }
  }

  /**
   * 安排下一轮任务详情轮询（仅生成中任务需要）
   */
  function schedulePoll(): void {
    stopPolling()
    pollTimer = setTimeout(() => {
      void pollOnce()
    }, POLL_INTERVAL_MS)
  }

  /**
   * 单次轮询：拉取任务详情并按状态分流（继续轮询 / 读取结构 / 停止）
   */
  async function pollOnce(): Promise<void> {
    const task = activeTask.value
    // 任务已被清空（返回修改等）时终止轮询
    if (!task) {
      return
    }
    try {
      const detail = await taskApi.detail(task.id)
      activeTask.value = detail.task
      // 按状态分流：成功读结构、终态停止、执行态继续轮询
      if (detail.task.status === 'SUCCEEDED') {
        stopPolling()
        await loadStructure(detail.task)
      } else if (detail.task.status === 'FAILED' || detail.task.status === 'CANCELLED') {
        stopPolling()
      } else {
        schedulePoll()
      }
    } catch {
      // 单次轮询失败不终止流程：网络抖动时继续下一轮
      schedulePoll()
    }
  }

  /**
   * 返回修改：回到目标要求输入态（草稿由输入组件 v-show 保活天然保留）；
   * 生成中的任务服务端继续执行，可在任务列表/详情中查看与取消
   */
  function back(): void {
    stopPolling()
    mode.value = 'upload'
  }

  /**
   * 确认生成：确认保留当前输出版本并回到上传态。
   * 服务端在任务成功时已落库版本，此处完成前端侧确认语义；
   * 版本确认弹窗（选择说明等）接入后在本次调用前插入。
   */
  function confirm(): void {
    const task = activeTask.value
    // 无成功任务或结构未就绪时不执行确认
    if (!task || !canConfirm.value) {
      return
    }
    stopPolling()
    mode.value = 'upload'
    hooks.onConfirmed(task)
  }

  // 组件卸载时清理轮询定时器
  onBeforeUnmount(() => {
    stopPolling()
  })

  return {
    mode,
    activeTask,
    structure,
    structureLoading,
    structureError,
    isGenerating,
    isFailed,
    canConfirm,
    submit,
    back,
    confirm,
  }
}
