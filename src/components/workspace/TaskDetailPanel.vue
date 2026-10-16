<script setup lang="ts">
/**
 * @component TaskDetailPanel
 * @description 左下任务详情分区：展示选中任务（GET /task/{id}）的完整信息——
 *              状态、进度条、当前执行步骤、错误信息、执行步骤列表与时间元数据。
 *              后端无 SSE 推送，任务处于 PENDING / RUNNING 时按固定间隔轮询任务详情，
 *              进入终态自动停止；每次刷新通过 updated 事件把最新任务抛给父组件同步列表。
 *              操作按钮：取消任务（PENDING/RUNNING 可用，RUNNING 中取消为异步生效）、
 *              重试任务（仅 FAILED/CANCELLED 可用，重试会创建新任务并通过 retried 事件通知父组件切换选中）。
 *              注意：分区标题"任务详情"由 WorkspaceLayout 的折叠标题栏提供。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { taskApi } from '@/api/task'
import { ApiError } from '@/api/http'
import { formatDuration, formatTime } from '@/utils/format'
import { stepStatusLabel, taskStatusLabel, taskTypeLabel } from '@/constants/task'
import type { Task, TaskDetail } from '@/api/types'

/** 组件入参 */
const props = defineProps<{
  /** 当前选中的任务 ID；null 表示未选中，展示引导文案 */
  taskId?: number | null
}>()

/** 组件对外事件 */
const emit = defineEmits<{
  /** 轮询 / 操作后拿到最新任务记录：父组件可同步任务列表展示 */
  (e: 'updated', task: Task): void
  /** 重试成功：携带新创建的任务记录，父组件应切换选中到新任务 */
  (e: 'retried', task: Task): void
}>()

// ==================== 详情数据 ====================

/** 任务详情（主体 + 步骤列表）；未选中或未加载完成时为 null */
const detail = ref<TaskDetail | null>(null)

/** 详情加载中标记 */
const loading = ref(false)

/** 详情加载错误提示 */
const loadError = ref('')

/** 轮询定时器句柄；null 表示当前没有进行中的轮询 */
let pollTimer: ReturnType<typeof setTimeout> | null = null

/** 轮询间隔毫秒数：任务无 SSE 推送，3 秒轮询在实时性与请求量之间折中 */
const POLL_INTERVAL_MS = 3000

/** 任务是否处于需要轮询的执行态（排队中 / 执行中） */
const isActiveStatus = (task: Task): boolean => task.status === 'PENDING' || task.status === 'RUNNING'

/**
 * 停止轮询：清理定时器并置空句柄
 */
function stopPolling(): void {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

/**
 * 拉取任务详情；任务处于执行态时安排下一轮轮询
 */
async function fetchDetail(): Promise<void> {
  const id = props.taskId
  // 未选中任务：清空详情展示引导文案
  if (id === null || id === undefined) {
    detail.value = null
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    detail.value = await taskApi.detail(id)
    emit('updated', detail.value.task)
    stopPolling()
    // 仅执行态任务需要轮询；终态（完成/失败/取消）不再请求
    if (isActiveStatus(detail.value.task)) {
      pollTimer = setTimeout(() => {
        void fetchDetail()
      }, POLL_INTERVAL_MS)
    }
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : '任务详情加载失败'
    // 加载失败同样停止轮询，避免错误状态下持续请求
    stopPolling()
  } finally {
    loading.value = false
  }
}

/** 详情滚动容器引用：切换任务时用于复位滚动位置 */
const scrollRef = ref<HTMLDivElement | null>(null)

// 选中任务变化：停止旧轮询、清空详情、复位滚动到顶部后重新加载
watch(
  () => props.taskId,
  () => {
    stopPolling()
    detail.value = null
    // 等待模板切换渲染后把滚动位置复位到顶部，避免残留上一次的滚动偏移
    void nextTick(() => {
      if (scrollRef.value) {
        scrollRef.value.scrollTop = 0
      }
    })
    void fetchDetail()
  },
  { immediate: true },
)

// 组件卸载：必须清理轮询定时器，防止内存泄漏与无效请求
onBeforeUnmount(() => {
  stopPolling()
})

// ==================== 派生展示 ====================

/** 任务主体（未加载时为 null） */
const task = computed(() => detail.value?.task ?? null)

/** 执行步骤列表（按 stepNo 升序，由接口保证） */
const steps = computed(() => detail.value?.steps ?? [])

/** 是否可取消：排队中 / 执行中且尚未请求过取消 */
const canCancel = computed(
  () => task.value !== null && isActiveStatus(task.value) && !task.value.cancelRequested,
)

/** 是否已请求取消（异步生效中，按钮置灰展示状态文案） */
const isCancelRequested = computed(() => task.value?.cancelRequested === true)

/** 是否可重试：仅失败 / 已取消任务提供重试入口 */
const canRetry = computed(
  () => task.value !== null && (task.value.status === 'FAILED' || task.value.status === 'CANCELLED'),
)

// ==================== 操作 ====================

/** 操作进行中标记：取消 / 重试共用，防止按钮重复点击 */
const acting = ref(false)

/** 操作失败提示（取消 / 重试共用，操作行下方展示） */
const actionError = ref('')

/**
 * 取消任务：调用取消接口后原位更新任务状态。
 * PENDING 直接取消；RUNNING 仅设置标记，由执行器在步骤边界生效。
 */
async function onCancel(): Promise<void> {
  const current = task.value
  // 防御：无任务或不可取消状态时忽略点击
  if (!current || !canCancel.value || acting.value) {
    return
  }
  acting.value = true
  actionError.value = ''
  try {
    const updated = await taskApi.cancel(current.id)
    // 原位更新任务主体；若已进入终态则轮询逻辑下一轮自然停止
    detail.value = detail.value ? { ...detail.value, task: updated } : null
    emit('updated', updated)
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : '取消任务失败'
  } finally {
    acting.value = false
  }
}

/**
 * 重试任务：仅 FAILED / CANCELLED 可重试，后端创建新任务记录。
 * 成功后通过 retried 事件通知父组件切换选中到新任务（本组件随 taskId 变化自动重载）。
 */
async function onRetry(): Promise<void> {
  const current = task.value
  // 防御：无任务或不可重试状态时忽略点击
  if (!current || !canRetry.value || acting.value) {
    return
  }
  acting.value = true
  actionError.value = ''
  try {
    const newTask = await taskApi.retry(current.id)
    emit('retried', newTask)
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : '重试任务失败'
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <!-- ref 绑定滚动容器：切换任务时由脚本复位 scrollTop 到顶部 -->
  <div ref="scrollRef" class="task-detail">
    <!-- 未选中任务：引导文案 -->
    <p v-if="!taskId" class="task-detail__hint">在上方任务列表中选择任务查看详情</p>

    <!-- 首次加载中 -->
    <p v-else-if="loading && !detail" class="task-detail__hint">加载中…</p>

    <!-- 加载失败：提示 + 重试按钮 -->
    <template v-else-if="loadError">
      <p class="task-detail__hint" role="alert">{{ loadError }}</p>
      <button class="task-detail__retry-load" type="button" @click="fetchDetail">重试</button>
    </template>

    <!-- 详情主体 -->
    <div v-else-if="task" class="task-detail__body">
      <!-- 头部：任务名 + 状态 -->
      <div class="task-detail__head">
        <span class="task-detail__name">{{ taskTypeLabel(task.taskType) }}</span>
        <span class="task-detail__status">{{ taskStatusLabel(task.status) }}</span>
      </div>

      <!-- 进度条：仅执行态展示 -->
      <template v-if="task.status === 'PENDING' || task.status === 'RUNNING'">
        <div class="task-detail__progress">
          <div class="task-detail__progress-bar" :style="{ width: `${task.progress}%` }" />
        </div>
        <p class="task-detail__progress-text">
          {{ task.progress }}% · {{ task.currentStep ?? '等待调度' }}
        </p>
      </template>

      <!-- 已请求取消：异步生效提示（按规范使用墨色小字） -->
      <p v-if="isCancelRequested" class="task-detail__hint">取消请求已提交，等待执行器确认</p>

      <!-- 元信息 -->
      <dl class="task-detail__meta">
        <div class="task-detail__meta-row">
          <dt>创建时间</dt>
          <dd>{{ formatTime(task.createTime) }}</dd>
        </div>
        <div v-if="task.startTime" class="task-detail__meta-row">
          <dt>开始时间</dt>
          <dd>{{ formatTime(task.startTime) }}</dd>
        </div>
        <div v-if="task.finishTime" class="task-detail__meta-row">
          <dt>结束时间</dt>
          <dd>{{ formatTime(task.finishTime) }}</dd>
        </div>
        <div v-if="task.elapsedMs !== null" class="task-detail__meta-row">
          <dt>已耗时</dt>
          <dd>{{ formatDuration(task.elapsedMs) }}</dd>
        </div>
        <div class="task-detail__meta-row">
          <dt>重试次数</dt>
          <dd>{{ task.retryCount }} / {{ task.maxRetry }}</dd>
        </div>
      </dl>

      <!-- 错误信息：仅失败任务展示（墨色小字，按规范不用红色） -->
      <div v-if="task.errorMessage || task.errorCode" class="task-detail__error">
        <p class="task-detail__error-title">错误信息</p>
        <p v-if="task.errorMessage" class="task-detail__error-text">{{ task.errorMessage }}</p>
        <p v-if="task.errorCode" class="task-detail__error-code">错误码：{{ task.errorCode }}</p>
      </div>

      <!-- 执行步骤列表 -->
      <div v-if="steps.length > 0" class="task-detail__steps">
        <p class="task-detail__section-title">执行步骤</p>
        <div v-for="step in steps" :key="step.stepNo" class="task-detail__step">
          <div class="task-detail__step-row">
            <span class="task-detail__step-no">{{ step.stepNo }}</span>
            <span class="task-detail__step-name">{{ step.stepName }}</span>
            <span class="task-detail__step-status">{{ stepStatusLabel(step.status) }}</span>
            <span v-if="step.durationMs !== null" class="task-detail__step-duration">
              {{ formatDuration(step.durationMs) }}
            </span>
          </div>
          <!-- 步骤结果说明 / 错误：辅助小字 -->
          <p v-if="step.errorMessage" class="task-detail__step-detail">
            {{ step.errorMessage }}
          </p>
          <p v-else-if="step.detail" class="task-detail__step-detail">{{ step.detail }}</p>
        </div>
      </div>

      <!-- 操作行：取消 / 重试按状态条件展示 -->
      <div v-if="canCancel || isCancelRequested || canRetry" class="task-detail__actions">
        <button
          v-if="canCancel"
          class="task-detail__action-btn"
          type="button"
          :disabled="acting"
          @click="onCancel"
        >
          {{ acting ? '处理中…' : '取消任务' }}
        </button>
        <button
          v-if="canRetry"
          class="task-detail__action-btn"
          type="button"
          :disabled="acting"
          @click="onRetry"
        >
          {{ acting ? '处理中…' : '重试任务' }}
        </button>
      </div>

      <!-- 操作失败提示 -->
      <p v-if="actionError" class="task-detail__hint" role="alert">{{ actionError }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.task-detail {
  height: 100%;
  overflow-y: auto;
}

.task-detail__hint {
  margin: 0;
  padding: $form-gap $input-padding-x;
  color: $ink-soft;
  font-size: $font-size-caption;
  line-height: 1.6;
}

.task-detail__retry-load {
  margin: 0 $input-padding-x;
  padding: 0;
  font: inherit;
  font-size: $font-size-caption;
  color: $ink;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  transition: color $transition-fast;

  &:hover {
    color: $ink-soft;
  }
}

.task-detail__body {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  padding: $gap-sm $input-padding-x;
}

.task-detail__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: $gap-sm;
}

.task-detail__name {
  font-size: $font-size-body;
  color: $ink;
  font-weight: $weight-medium;
}

.task-detail__status {
  font-size: $font-size-caption;
  color: $ink-soft;
}

.task-detail__progress {
  height: 3px; // 结构尺寸：详情区细进度条
  background-color: $line;
  border-radius: $radius;
  overflow: hidden;
}

.task-detail__progress-bar {
  height: 100%;
  background-color: $accent;
  transition: width $transition-fast;
}

.task-detail__progress-text {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.task-detail__meta {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  margin: 0;
}

.task-detail__meta-row {
  display: flex;
  justify-content: space-between;
  gap: $gap-sm;
}

.task-detail__meta-row dt {
  font-size: $font-size-caption;
  color: $ink-soft;
}

.task-detail__meta-row dd {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink;
}

.task-detail__error {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  padding: $gap-sm;
  background-color: $paper-base;
  border: $border-w solid $line;
  border-radius: $radius;
}

.task-detail__error-title {
  margin: 0;
  font-size: $font-size-caption;
  font-weight: $weight-medium;
  color: $ink;
}

.task-detail__error-text {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink;
  line-height: 1.6;
  word-break: break-all;
}

.task-detail__error-code {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.task-detail__section-title {
  margin: 0 0 $gap-xs;
  font-size: $font-size-caption;
  font-weight: $weight-medium;
  color: $ink;
}

.task-detail__step {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  padding: $gap-xs 0;
  border-bottom: $border-w solid $line;

  &:last-child {
    border-bottom: none;
  }
}

.task-detail__step-row {
  display: flex;
  align-items: baseline;
  gap: $gap-sm;
}

.task-detail__step-no {
  flex-shrink: 0;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.task-detail__step-name {
  flex: 1;
  min-width: 0;
  font-size: $font-size-caption;
  color: $ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-detail__step-status {
  flex-shrink: 0;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.task-detail__step-duration {
  flex-shrink: 0;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.task-detail__step-detail {
  margin: 0;
  padding-left: calc(#{$font-size-caption} * 3); // 与步骤名左缘对齐（序号 + 间距的近似宽度）
  font-size: $font-size-caption;
  color: $ink-soft;
  line-height: 1.6;
  word-break: break-all;
}

.task-detail__actions {
  display: flex;
  gap: $gap-sm;
}

.task-detail__action-btn {
  height: $control-height;
  padding: 0 $input-padding-x;
  font: inherit;
  font-size: $font-size-caption;
  color: $ink;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
  cursor: pointer;
  transition: border-color $transition-fast, opacity $transition-fast;

  &:hover:not(:disabled) {
    border-color: $ink-soft;
  }

  &:disabled {
    opacity: $disabled-opacity;
    cursor: default;
  }
}
</style>
