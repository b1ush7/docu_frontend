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
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout.vue'
import FileListPanel from '@/components/workspace/FileListPanel.vue'
import TaskListPanel from '@/components/workspace/TaskListPanel.vue'
import TaskDetailPanel from '@/components/workspace/TaskDetailPanel.vue'
import MainUploadPanel from '@/components/workspace/MainUploadPanel.vue'
import PreviewPanel from '@/components/workspace/PreviewPanel.vue'
import PreviewActions from '@/components/workspace/PreviewActions.vue'
import SidebarSearch from '@/components/workspace/SidebarSearch.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { usePreviewFlow } from '@/composables/usePreviewFlow'
import type { FileAsset, Task } from '@/api/types'

// 当前登录用户（模块级单例，会话内仅请求一次 /user/me；后端暂无昵称/头像字段，以 username 展示）
const { user, fetchUser } = useCurrentUser()

// 首次进入工作台即拉取用户信息（主区右上角展示）
onMounted(() => {
  fetchUser()
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
    fileListRef.value?.refresh()
    // 已确认任务的输出在任务列表中同步呈现最新状态
    taskListRef.value?.refresh()
    console.info('[workspace] 版本已确认：', task.outputVersion)
  },
})

/**
 * 列表内点击文件项：记录选中 ID 并刷新相关任务
 * @param file 被选中的文件资产
 */
function onFileSelect(file: FileAsset): void {
  currentFileId.value = file.id
  // 文件切换后原选中任务大概率不属于新文件，重置任务选中态
  currentTaskId.value = null
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
  }
}

/**
 * 查看版本历史（版本面板接入前为占位）
 * @param file 目标文件
 */
function onViewVersions(file: FileAsset): void {
  // TODO 版本历史面板接入后实现
  console.info('[workspace] 查看版本历史：', file.displayName)
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
  // 新任务同步进任务列表并选中，左侧详情随之展示生成进度
  const task = previewFlow.activeTask.value
  if (task) {
    currentTaskId.value = task.id
    taskListRef.value?.refresh()
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

        <div class="main-area__body">
          <!-- 状态一：上传与目标要求输入 -->
          <div v-show="previewFlow.mode.value === 'upload'" class="main-area__state">
            <MainUploadPanel
              :has-file="currentFileId !== null"
              @uploaded="onMainUploadSuccess"
              @submit="onSubmitInstruction"
            />
          </div>

          <!-- 状态二：生成中 / 文稿预览 + 底部操作按钮组 -->
          <div v-show="previewFlow.mode.value === 'preview'" class="main-area__state main-area__state--preview">
            <PreviewPanel
              :task="previewFlow.activeTask.value"
              :structure="previewFlow.structure.value"
              :structure-loading="previewFlow.structureLoading.value"
              :structure-error="previewFlow.structureError.value"
            />
            <PreviewActions
              :can-confirm="previewFlow.canConfirm.value"
              @back="previewFlow.back()"
              @confirm="previewFlow.confirm()"
            />
          </div>
        </div>
      </div>
    </template>
  </WorkspaceLayout>
</template>

<style scoped lang="scss">
// 主内容区：纵向分用户信息条与状态面板两层
.main-area {
  display: flex;
  flex-direction: column;
  height: 100%;
}

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
