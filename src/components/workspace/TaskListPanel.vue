<script setup lang="ts">
/**
 * @component TaskListPanel
 * @description 左中任务列表分区：展示当前用户或当前选中文件的任务列表。
 *              未选中文件时调用 GET /task/list 全量分页；选中文件后切换为
 *              GET /task/by-file/{fileId} 一次性拉取该文件的全部任务。
 *              每项展示任务名称（类型映射）、状态标识、指令摘要与创建时间；
 *              点击任务项向上抛出 select 事件，由父组件刷新左下任务详情。
 *              注意：分区标题"任务列表"由 WorkspaceLayout 的折叠标题栏提供。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { taskApi } from '@/api/task'
import { useRequestGuard } from '@/composables/useRequestGuard'
import { ApiError } from '@/api/http'
import { formatTime } from '@/utils/format'
import { taskStatusLabel, taskTypeLabel } from '@/constants/task'
import type { Task } from '@/api/types'

/** 组件入参 */
const props = defineProps<{
  /** 当前选中的文件 ID：有值时按该文件过滤任务列表，null 展示用户全部任务 */
  currentFileId?: number | null
  /** 当前选中的任务 ID，用于列表高亮；未选中为 null */
  currentTaskId?: number | null
  /** 全局搜索关键字：来自侧边栏顶部搜索框（防抖后的值），空串/undefined 表示不过滤 */
  keyword?: string
}>()

/** 组件对外事件 */
const emit = defineEmits<{
  /** 点击任务项：父组件刷新左下任务详情 */
  (e: 'select', task: Task): void
}>()

// ==================== 列表数据 ====================

/** 任务列表（已加载各页数据的拼接结果；按文件查询时为全量） */
const tasks = ref<Task[]>([])

/** 服务端数据总条数，用于判断是否还有更多页（仅全量分页模式有意义） */
const total = ref(0)

/** 当前页码，从 1 开始（仅全量分页模式使用） */
const page = ref(1)

/** 每页条数：侧边栏面板较小，取 20 平衡请求次数与滚动长度 */
const PAGE_SIZE = 20

/** 列表加载中标记 */
const loading = ref(false)

/** 列表加载错误提示 */
const listError = ref('')

/**
 * 是否还有更多页：已加载条数少于总数即还有；
 * 按文件查询模式下 tasks 即全量（length === total），恒为 false，不显示加载更多。
 */
const hasMore = computed(() => tasks.value.length < total.value)

/**
 * 拉取任务列表
 * @param mode reset 首屏 / 刷新：覆盖列表；append 加载更多：追加到现有列表尾部
 */
const requestGuard = useRequestGuard(() => [props.currentFileId, props.keyword])
const searching = computed(() => !!props.keyword?.trim())
async function fetchTasks(mode: 'reset' | 'append' = 'reset'): Promise<void> {
  if (mode === 'append' && loading.value) return
  const current = requestGuard()
  const fileId = props.currentFileId
  let nextPage = mode === 'reset' ? 1 : page.value + 1
  loading.value = true; listError.value = ''
  if (mode === 'reset') { tasks.value = []; total.value = 0 }
  try {
    if (fileId != null) {
      const list = await taskApi.listByFile(fileId)
      if (!current()) return
      tasks.value = list; total.value = list.length; page.value = 1
      return
    }
    // The existing API has no keyword filter. Search scans all pages, canceling when context changes.
    do {
      const result = await taskApi.list({ page: nextPage, size: PAGE_SIZE })
      if (!current()) return
      const existing = new Map(tasks.value.map(task => [task.id, task]))
      result.records.forEach(task => existing.set(task.id, task))
      tasks.value = [...existing.values()]; total.value = result.total; page.value = nextPage
      if (!searching.value || !result.records.length || nextPage >= result.pages || nextPage * PAGE_SIZE >= result.total) break
      nextPage++
    } while (current())
  } catch (e) {
    if (current()) listError.value = e instanceof ApiError ? e.message : '任务列表加载失败，搜索结果可能不完整'
  } finally { if (current()) loading.value = false }
}
onMounted(() => { void fetchTasks() })
watch(() => [props.currentFileId, props.keyword], () => { void fetchTasks() }, { flush: 'sync' })
async function loadMore(): Promise<void> { if (!loading.value) await fetchTasks('append') }
function refresh(): void { void fetchTasks() }

// ==================== 选中与展示辅助 ====================

/**
 * 点击任务项：通知父组件选中该任务
 * @param task 被点击的任务记录
 */
function selectTask(task: Task): void {
  emit('select', task)
}

// ==================== 全局搜索过滤 ====================

/** Search filters the complete file history or all scanned user pages. */
const filteredTasks = computed(() => {
  const kw = props.keyword?.trim().toLowerCase()
  // 无关键字直接返回原列表
  if (!kw) {
    return tasks.value
  }
  return tasks.value.filter((task) => {
    // 名称与摘要为主匹配目标，状态文案与时间作为辅助线索
    const haystack = [
      taskTypeLabel(task.taskType),
      task.instruction ?? '',
      taskStatusLabel(task.status),
      formatTime(task.createTime),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(kw)
  })
})

// 对外暴露刷新方法：父组件提交新任务 / 轮询回写后可调用同步列表
defineExpose({ refresh })
</script>

<template>
  <div class="task-list">
    <!-- 列表主体：加载 / 错误 / 空 / 数据 四种状态 -->
    <div class="task-list__body">
      <p v-if="searching && loading" class="task-list__hint" role="status">正在搜索全部任务，已读取 {{ tasks.length }} / {{ total || '…' }} 条…</p>
      <p v-if="loading && tasks.length === 0" class="task-list__hint">加载中…</p>

      <template v-else-if="listError">
        <p class="task-list__hint" role="alert">{{ listError }}</p>
        <button class="task-list__retry-btn" type="button" @click="refresh">重试</button>
      </template>

      <!-- 空态区分场景：搜索无匹配 / 选中文件无任务 / 用户暂无任务 -->
      <p v-else-if="filteredTasks.length === 0" class="task-list__hint">
        {{ props.keyword
          ? '未找到匹配的任务'
          : currentFileId
            ? '该文件暂无任务'
            : '暂无任务' }}
      </p>

      <template v-else>
        <div
          v-for="task in filteredTasks"
          :key="task.id"
          class="task-list__item"
          :class="{ 'task-list__item--active': task.id === currentTaskId }"
          @click="selectTask(task)"
        >
          <!-- 首行：任务名称 + 状态标识 -->
          <div class="task-list__row-top">
            <span class="task-list__name">{{ taskTypeLabel(task.taskType) }}</span>
            <span
              class="task-list__status"
              :class="`task-list__status--${task.status.toLowerCase()}`"
            >
              <!-- 执行中额外显示进度百分比，列表内即可感知进度 -->
              {{ taskStatusLabel(task.status) }}<template v-if="task.status === 'RUNNING'"> {{ task.progress }}%</template>
            </span>
          </div>
          <!-- 次行：用户指令摘要，无指令时省略 -->
          <span v-if="task.instruction" class="task-list__instruction">{{ task.instruction }}</span>
          <span class="task-list__time">{{ formatTime(task.createTime) }}</span>
        </div>

        <!-- 加载更多（按文件查询模式下 hasMore 恒为 false，不会显示） -->
        <button
          v-if="hasMore && !searching"
          class="task-list__more-btn"
          type="button"
          :disabled="loading"
          @click="loadMore"
        >
          {{ loading ? '加载中…' : '加载更多' }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.task-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.task-list__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.task-list__hint {
  margin: 0;
  padding: $form-gap $input-padding-x;
  color: $ink-soft;
  font-size: $font-size-caption;
  line-height: 1.6;
}

.task-list__retry-btn {
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

.task-list__item {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  padding: $gap-sm $input-padding-x;
  cursor: pointer;
  transition: background-color $transition-fast;

  // hover 时整行浮起一档
  &:hover {
    background-color: $paper-base;
  }
}

// 选中态：底色浮起 + 左缘一条强调色细线（inset 阴影避免挤压布局）
.task-list__item--active {
  background-color: $paper-base;
  box-shadow: inset 2px 0 0 $accent;
}

.task-list__row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: $gap-sm;
}

.task-list__name {
  font-size: $font-size-body;
  color: $ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-list__status {
  flex-shrink: 0;
  font-size: $font-size-caption;
  color: $ink-soft;

  // 状态色遵循纸面克制原则：执行中用强调色，已失败加重字重，其余保持墨色系
  &--running {
    color: $accent;
    font-weight: $weight-medium;
  }

  &--succeeded {
    color: $ink;
  }

  &--failed {
    color: $ink;
    font-weight: $weight-medium;
  }
}

.task-list__instruction {
  font-size: $font-size-caption;
  color: $ink-soft;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-list__time {
  font-size: $font-size-caption;
  color: $ink-soft;
}

.task-list__more-btn {
  display: block;
  margin: $gap-sm auto $form-gap;
  padding: $gap-xs $form-gap;
  font: inherit;
  font-size: $font-size-caption;
  color: $ink-soft;
  background: none;
  border: none;
  cursor: pointer;
  transition: color $transition-fast;

  &:hover:not(:disabled) {
    color: $ink;
  }

  &:disabled {
    opacity: $disabled-opacity;
    cursor: default;
  }
}
</style>
