<script setup lang="ts">
/**
 * @component WorkspaceView
 * @description 用户主工作台页面：组装 WorkspaceLayout 布局外壳，
 *              向五个插槽填充内容（全局搜索 / 文件列表 / 任务列表 / 任务详情 / 主内容区）。
 *              主内容区两种状态：upload 上传与目标要求输入（MainUploadPanel，v-show 保活保留草稿）、
 *              preview 生成中与文稿预览（PreviewPanel + PreviewActions，由 usePreviewFlow 编排）。
 *              页面级暂存"当前选中文件 / 任务 ID"，workspace store 接入后迁移到全局状态。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout.vue'
import FileListPanel from '@/components/workspace/FileListPanel.vue'
import TaskListPanel from '@/components/workspace/TaskListPanel.vue'
import TaskDetailPanel from '@/components/workspace/TaskDetailPanel.vue'
import MainUploadPanel from '@/components/workspace/MainUploadPanel.vue'
import PreviewPanel from '@/components/workspace/PreviewPanel.vue'
import PreviewActions from '@/components/workspace/PreviewActions.vue'
import SidebarSearch from '@/components/workspace/SidebarSearch.vue'
import VersionHistoryDialog from '@/components/workspace/VersionHistoryDialog.vue'
import AiHistoryDialog from '@/components/workspace/AiHistoryDialog.vue'
import TaskCreateDialog from '@/components/workspace/TaskCreateDialog.vue'
import OcrDialog from '@/components/workspace/OcrDialog.vue'
import TemplateGenerateDialog from '@/components/workspace/TemplateGenerateDialog.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { usePreviewFlow } from '@/composables/usePreviewFlow'
import { previewApi } from '@/api/preview'
import { fileApi } from '@/api/file'
import { saveBlob, versionFileName } from '@/utils/download'
import { ApiError } from '@/api/http'
import type { FileAsset, Task, Version } from '@/api/types'

const router = useRouter()
const route = useRoute()
const selectedFile = ref<FileAsset | null>(null)
const historyVisible = ref(false)
const historyFileId = ref<number | null>(null)
const aiHistoryVisible = ref(false)
const taskCreateVisible = ref(false)
/** OCR 对话框：只在当前版本是 PDF 或图片时可用 */
const ocrVisible = ref(false)
/** 按模板生成文档 */
const templateVisible = ref(false)
const navigationLoading = ref(false)
const downloading = ref(false)
const displayedSessionId = ref<number | null>(null)
function routeContext(context: { file?: number; version?: number; aiSession?: number; reply?: number } = {}): void {
  void router.replace({ query: { ...route.query, file: undefined, version: undefined, aiSession: undefined, reply: undefined, ...context } }).catch(() => {})
}
function positiveId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

// 当前登录用户（模块级单例，会话内仅请求一次 /user/me；后端暂无昵称/头像字段，以 username 展示）
const { user, fetchUser } = useCurrentUser()

// 首次进入工作台即拉取用户信息（主区右上角展示）
onMounted(() => {
  void fetchUser()
  void restoreLocation()
})

/** 头像占位字符：用户名首字大写（无头像图片字段时的圆形文字占位） */
const avatarChar = computed(() =>
  user.value?.username ? user.value.username.charAt(0).toUpperCase() : '',
)

/** 全局搜索关键字：由 SidebarSearch 防抖后抛出，分发给文件/任务两个列表过滤 */
const searchKeyword = ref('')

/** 文件列表面板组件引用：主内容区上传成功 / 版本确认后调用其 refresh 同步列表 */
const fileListRef = ref<InstanceType<typeof FileListPanel> | null>(null)

/** 任务列表面板组件引用：提交新任务 / 任务状态变化后调用其 refresh 同步列表 */
const taskListRef = ref<InstanceType<typeof TaskListPanel> | null>(null)

/** 当前选中文件 ID（store 接入前暂存于页面级） */
const currentFileId = ref<number | null>(null)

/** 当前选中任务 ID（store 接入前暂存于页面级） */
const currentTaskId = ref<number | null>(null)

// 预览流程编排：提交指令 → 轮询 → 结构预览 → 返回修改 / 确认生成
const previewFlow = usePreviewFlow({
  /**
   * 确认生成完成：刷新文件列表（新版本已落库）并同步任务列表
   * @param task 被确认的任务
   */
  onConfirmed: (task: Task) => {
    currentFileId.value = task.fileId
    fileListRef.value?.refresh()
    // 已确认任务的输出在任务列表中同步呈现最新状态
    taskListRef.value?.refresh()
    if (task.fileId !== null) void fileApi.detail(task.fileId).then(file => {
      if (currentFileId.value === file.id) selectedFile.value = file
    }).catch(() => {})
  },
  onReplySaved: (sessionId, messageId, fileId) => {
    displayedSessionId.value = sessionId
    routeContext({ aiSession: sessionId, reply: messageId, ...(fileId !== null ? { file: fileId } : {}) })
  },
})

/**
 * 列表内点击文件项：记录选中 ID 并刷新相关任务
 * @param file 被选中的文件资产
 */
async function onFileSelect(file: FileAsset): Promise<void> {
  if (previewFlow.busy.value || navigationLoading.value) return
  selectedFile.value = file
  currentFileId.value = file.id
  // 文件切换后原选中任务大概率不属于新文件，重置任务选中态
  currentTaskId.value = null
  displayedSessionId.value = null
  routeContext({ file: file.id, version: file.latestVersion })
  await previewFlow.openVersion(file.id, file.latestVersion)
  // 任务列表随 currentFileId 变化自动重新拉取（组件内 watch）
}

/**
 * 主内容区上传成功：同步文件列表并选中新文件
 * @param file 服务端返回的新文件资产
 */
function onMainUploadSuccess(file: FileAsset): void {
  // 列表面板刷新，让新文件出现在列表中
  fileListRef.value?.refresh()
  currentFileId.value = file.id
  selectedFile.value = file
  previewFlow.reset()
  displayedSessionId.value = null
  routeContext()
}

/**
 * 文件删除成功：若删除的正是当前选中文件，则重置选中状态
 * @param fileId 被删除的文件 ID
 */
function onFileDeleted(fileId: number): void {
  // 只在删除的就是选中文件时清空，避免误清其他选中
  if (currentFileId.value === fileId) {
    currentFileId.value = null
    // 该文件相关任务一并退出选中态
    currentTaskId.value = null
    selectedFile.value = null
    previewFlow.reset()
    displayedSessionId.value = null
    routeContext()
  }
}

/**
 * 打开服务端版本历史。
 * @param file 目标文件
 */
function onViewVersions(file: FileAsset): void {
  if (previewFlow.busy.value || navigationLoading.value) return
  historyFileId.value = file.id
  historyVisible.value = true
}

async function onVersionPreview(file: FileAsset, version: Version): Promise<void> {
  if (previewFlow.busy.value || navigationLoading.value) return
  selectedFile.value = file
  currentFileId.value = file.id
  currentTaskId.value = null
  displayedSessionId.value = null
  historyVisible.value = false
  routeContext({ file: file.id, version: version.versionNo })
  await previewFlow.openVersion(file.id, version.versionNo)
}
async function onVersionRestored(file: FileAsset, version: Version): Promise<void> {
  fileListRef.value?.refresh()
  await onVersionPreview(file, version)
}
async function downloadSelected(): Promise<void> {
  if (!selectedFile.value || downloading.value || previewFlow.busy.value) return
  downloading.value = true
  const asset = selectedFile.value
  const preview = previewFlow.previewVersion.value
  const versionNo = preview?.fileId === asset.id ? preview.versionNo : asset.latestVersion
  try {
    const version = await fileApi.versionDetail(asset.id, versionNo)
    const blob = await fileApi.downloadVersion(asset.id, versionNo)
    saveBlob(blob, versionFileName(asset.displayName, versionNo, version.extension))
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '下载失败') }
  finally { downloading.value = false }
}
async function onHistoryReply(sessionId: number, messageId: number): Promise<void> {
  if (previewFlow.busy.value || navigationLoading.value) return
  navigationLoading.value = true
  try {
    const session = await previewFlow.restoreReply(sessionId, messageId)
    if (!session) return
    currentFileId.value = session.fileId
    selectedFile.value = session.fileId !== null ? await fileApi.detail(session.fileId) : null
    currentTaskId.value = null
    aiHistoryVisible.value = false
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '会话恢复失败') }
  finally { navigationLoading.value = false }
}
function onSessionChanged(sessionId: number): void {
  if (displayedSessionId.value === sessionId) {
    previewFlow.reset()
    displayedSessionId.value = null
    routeContext()
  }
}
async function restoreLocation(): Promise<void> {
  const sid = positiveId(route.query.aiSession)
  const replyId = positiveId(route.query.reply)
  if (sid !== null && replyId !== null) { await onHistoryReply(sid, replyId); return }
  const fileId = positiveId(route.query.file)
  const versionNo = positiveId(route.query.version)
  if (fileId === null || versionNo === null) return
  navigationLoading.value = true
  try {
    const file = await fileApi.detail(fileId)
    selectedFile.value = file
    currentFileId.value = fileId
    await previewFlow.openVersion(fileId, versionNo)
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '恢复文档失败'); routeContext() }
  finally { navigationLoading.value = false }
}
function onTaskCreated(task: Task): void {
  currentTaskId.value = task.id
  taskListRef.value?.refresh()
  if (task.status === 'FAILED') ElMessage.warning('任务已记录但提交失败，请查看任务详情')
  else ElMessage.success('任务已提交，可在左侧查看进度')
}

/**
 * 模板生成成功：刷新文件列表并选中新文件。
 * 生成的是**新文件**（不是既有文件的新版本），所以这里按文件而不是按任务处理。
 */
function onTemplateCreated(file: FileAsset): void {
  fileListRef.value?.refresh()
  selectedFile.value = file
  currentFileId.value = file.id
}
async function onTaskResult(task: Task): Promise<void> {
  if (task.status !== 'SUCCEEDED' || task.fileId === null || task.outputVersion === null || previewFlow.busy.value || navigationLoading.value) return
  navigationLoading.value = true
  try {
    const file = await fileApi.detail(task.fileId)
    const version = await fileApi.versionDetail(task.fileId, task.outputVersion)
    selectedFile.value = file
    currentFileId.value = file.id
    displayedSessionId.value = null
    routeContext({ file: file.id, version: version.versionNo })
    await previewFlow.openVersion(file.id, version.versionNo)
    currentTaskId.value = task.id
    fileListRef.value?.refresh()
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '打开任务结果失败') }
  finally { navigationLoading.value = false }
}

/**
 * 列表内点击任务项：记录选中 ID，左下任务详情区域随后展示该任务
 * @param task 被选中的任务记录
 */
function onTaskSelect(task: Task): void {
  currentTaskId.value = task.id
}

/** 上一次轮询回写时的任务状态：仅在状态变化时刷新任务列表，避免轮询期间整表高频刷新造成列表跳动 */
let lastPolledTaskKey = ''

/**
 * 任务详情轮询回写最新任务记录：状态变化时同步任务列表展示
 * @param task 详情轮询拿到的最新任务记录
 */
function onTaskUpdated(task: Task): void {
  // 任务 ID + 状态 组成变更标识：同任务轮询中仅状态迁移才刷新列表
  const key = `${task.id}:${task.status}`
  if (key !== lastPolledTaskKey) {
    lastPolledTaskKey = key
    taskListRef.value?.refresh()
    if (task.status === 'SUCCEEDED') fileListRef.value?.refresh()
  }
}

/**
 * 任务重试成功：切换选中到新创建的重试任务并刷新列表
 * @param task 重试创建的新任务记录
 */
function onTaskRetried(task: Task): void {
  currentTaskId.value = task.id
  taskListRef.value?.refresh()
}

/**
 * 目标要求提交：创建 AI_EDIT 任务并进入预览态（需先具备选中文件）
 * @param instruction 用户输入的编辑指令
 */
async function onSubmitInstruction(instruction: string): Promise<void> {
  // 无选中文件时不提交（按钮已禁用，此处为兜底防御）
  if (currentFileId.value === null) {
    return
  }
  await previewFlow.submit(currentFileId.value, instruction)
  // AI message IDs are not /task IDs; keep the asynchronous task selection separate.
}

/**
 * 导出当前预览版本的 PDF。
 * 必须用结构里的明确 versionNo，不能用「最新版本」——
 * 否则用户看到的版本和导出的版本可能不是同一份。
 */
async function onExportPdf(): Promise<void> {
  const current = previewFlow.previewVersion.value
  if (!current) {
    return
  }
  try {
    const blob = await previewApi.exportPdf(current.fileId, current.versionNo)
    saveBlob(blob, versionFileName(selectedFile.value?.displayName || 'document', current.versionNo, 'pdf'))
  } catch (e) {
    // 503 表示服务端未接入渲染后端；400 表示该格式不支持导出
    ElMessage.error(e instanceof ApiError ? e.message : '导出 PDF 失败')
  }
}
</script>

<template>
  <WorkspaceLayout>
    <!-- 左侧侧边栏顶部：全局搜索（同时过滤文件与任务） -->
    <template #search>
      <SidebarSearch @search="searchKeyword = $event" />
    </template>

    <!-- 左上：文件列表 -->
    <template #files>
      <FileListPanel
        ref="fileListRef"
        :current-file-id="currentFileId"
        :keyword="searchKeyword"
        :disabled="previewFlow.busy.value || navigationLoading"
        @select="onFileSelect"
        @deleted="onFileDeleted"
        @view-versions="onViewVersions"
      />
    </template>

    <!-- 左中：任务列表 -->
    <template #tasks>
      <TaskListPanel
        ref="taskListRef"
        :current-file-id="currentFileId"
        :current-task-id="currentTaskId"
        :keyword="searchKeyword"
        @select="onTaskSelect"
      />
    </template>

    <!-- 左下：任务详情 -->
    <template #detail>
      <TaskDetailPanel
        :task-id="currentTaskId"
        @updated="onTaskUpdated"
        @retried="onTaskRetried"
        @open-result="onTaskResult"
      />
    </template>

    <!-- 右侧主内容区：右上角用户信息 + 两种状态（v-show 保活切换，输入草稿不丢失） -->
    <template #main>
      <div class="main-area">
        <!-- 用户信息条：靠右展示首字占位头像 + 用户名 -->
        <div class="main-area__userbar" :title="user?.username ?? ''">
          <span class="main-area__avatar">{{ avatarChar }}</span>
          <span class="main-area__nickname">{{ user?.username ?? '…' }}</span>
        </div>
        <div class="main-area__toolbar">
          <span class="main-area__filename">{{ selectedFile?.displayName || '请选择或上传文件' }}<template v-if="previewFlow.previewVersion.value"> · v{{ previewFlow.previewVersion.value.versionNo }}</template></span>
          <el-button size="small" :disabled="!selectedFile || previewFlow.busy.value || navigationLoading" :loading="downloading" @click="downloadSelected">下载当前版本</el-button>
          <el-button size="small" :disabled="!selectedFile || previewFlow.busy.value || navigationLoading" @click="selectedFile && onViewVersions(selectedFile)">版本历史</el-button>
          <el-button size="small" :disabled="previewFlow.busy.value || navigationLoading" @click="aiHistoryVisible = true">AI 会话历史</el-button>
          <el-button size="small" :disabled="!selectedFile || previewFlow.busy.value || navigationLoading" @click="taskCreateVisible = true">转换／导出</el-button>
          <el-button size="small" :disabled="previewFlow.busy.value || navigationLoading" @click="templateVisible = true">模板生成</el-button>
        </div>
        <p v-if="previewFlow.sessionArchived.value" class="main-area__notice">此会话已归档，仅可查看。需要修改时请返回并创建新的编辑请求。</p>

        <div class="main-area__body">
          <!-- 状态一：上传与目标要求输入 -->
          <div v-show="previewFlow.mode.value === 'upload'" class="main-area__state">
            <MainUploadPanel
              :has-file="currentFileId !== null"
              :file-name="selectedFile?.displayName"
              :busy="previewFlow.busy.value || navigationLoading"
              @uploaded="onMainUploadSuccess"
              @submit="onSubmitInstruction"
            />
          </div>

          <!-- 状态二：生成中 / 文稿预览 + 底部操作按钮组 -->
          <div v-show="previewFlow.mode.value === 'preview'" class="main-area__state main-area__state--preview">
            <PreviewPanel
              :task="previewFlow.activeTask.value"
              :changes="previewFlow.changes.value"
              :plan-status="previewFlow.planStatus.value"
              :reply="previewFlow.reply.value"
              :stream-text="previewFlow.streamText.value"
              :preview-version="previewFlow.previewVersion.value"
              :structure="previewFlow.structure.value"
              :structure-loading="previewFlow.structureLoading.value"
              :structure-error="previewFlow.structureError.value"
            />
            <PreviewActions
              :can-confirm="previewFlow.canConfirm.value"
              :can-discard="previewFlow.canDiscard.value"
              :can-export="previewFlow.previewVersion.value !== null && !previewFlow.busy.value"
              :can-ocr="['pdf', 'png', 'jpg', 'jpeg'].includes(previewFlow.previewVersion.value?.extension ?? '')"
              :busy="previewFlow.busy.value"
              @back="previewFlow.back()"
              @confirm="previewFlow.confirm()"
              @discard="previewFlow.discard()"
              @export="onExportPdf"
              @ocr="ocrVisible = true"
            />
          </div>
        </div>
      </div>
    </template>
  </WorkspaceLayout>
  <VersionHistoryDialog v-model="historyVisible" :file-id="historyFileId" @preview="onVersionPreview" @restored="onVersionRestored" />
  <AiHistoryDialog v-model="aiHistoryVisible" :file-id="currentFileId" :opening="navigationLoading" @reply="onHistoryReply" @changed="onSessionChanged" />
  <TaskCreateDialog v-model="taskCreateVisible" :file-id="currentFileId" @created="onTaskCreated" />
  <TemplateGenerateDialog v-model="templateVisible" @created="onTemplateCreated" />
  <OcrDialog
    v-model="ocrVisible"
    :file-id="previewFlow.previewVersion.value?.fileId ?? null"
    :version-no="previewFlow.previewVersion.value?.versionNo ?? null"
    :extension="previewFlow.previewVersion.value?.extension ?? null"
  />
</template>

<style scoped lang="scss">
// 主内容区：纵向分用户信息条与状态面板两层
.main-area {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.main-area__toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 16px; border-bottom: 1px solid $line; }
.main-area__filename { flex: 1; min-width: 140px; overflow-wrap: anywhere; }
.main-area__notice { padding: 8px 16px; margin: 0; }

.main-area__userbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: $gap-xs;
  padding: $gap-sm $card-padding;
  border-bottom: $border-w solid $line;
}

.main-area__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px; // 头像结构尺寸
  height: 24px;
  // 圆形头像占位（无图片字段时的文字首字形态）
  border-radius: 50%;
  background-color: $paper-base;
  border: $border-w solid $line;
  color: $ink;
  font-size: $font-size-caption;
  font-weight: $weight-medium;
}

.main-area__nickname {
  font-size: $font-size-caption;
  color: $ink;
}

.main-area__body {
  flex: 1;
  min-height: 0;
}

// 单一状态容器占满主区；两个状态通过 v-show 互斥展示
.main-area__state {
  height: 100%;
}

// 预览态：纵向排布预览面板与底部按钮组
.main-area__state--preview {
  display: flex;
  flex-direction: column;
  padding: 0 $card-padding;
}
</style>
