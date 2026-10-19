<script setup lang="ts">
/**
 * @component FileListPanel
 * @description 左上文件列表分区：调用 GET /file/list 分页拉取当前用户文件，
 *              展示文件类型图标、文件名与创建时间。
 *              行内 hover 展示行级操作：删除（二次确认）/ 重命名（行内编辑）/ 版本历史。
 *              点击文件项向上抛出 select 事件，由父组件切换右侧主内容区状态并刷新任务。
 *              注意：分区标题"文件列表"由 WorkspaceLayout 的折叠标题栏提供，本组件不重复渲染；
 *              文件上传统一由右侧主内容区 MainUploadPanel 承担，本组件不提供上传入口。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { fileApi } from '@/api/file'
import { ApiError } from '@/api/http'
import { formatTime } from '@/utils/format'
import type { FileAsset } from '@/api/types'

/** 组件入参 */
const props = defineProps<{
  /** 当前选中的文件 ID，用于列表高亮；未选中为 null */
  currentFileId?: number | null
  /** 全局搜索关键字：来自侧边栏顶部搜索框（防抖后的值），空串/undefined 表示不过滤 */
  keyword?: string
  disabled?: boolean
}>()

/** 组件对外事件 */
const emit = defineEmits<{
  /** 点击文件项：父组件切换右侧主区状态并刷新任务信息 */
  (e: 'select', file: FileAsset): void
  /** 删除成功：父组件若正选中该文件需重置主区状态 */
  (e: 'deleted', fileId: number): void
  /** 查看版本历史：父组件打开版本历史（版本面板接入前为占位） */
  (e: 'view-versions', file: FileAsset): void
}>()

// ==================== 列表数据 ====================

/** 文件列表（已加载各页数据的拼接结果） */
const files = ref<FileAsset[]>([])

/** 服务端数据总条数，用于判断是否还有更多页 */
const total = ref(0)

/** 当前页码，从 1 开始 */
const page = ref(1)

/** 每页条数：侧边栏面板较小，取 20 平衡请求次数与滚动长度 */
const PAGE_SIZE = 20

/** 列表加载中标记 */
const loading = ref(false)

/** 列表级错误提示（加载失败 / 删除失败共用，顶部展示可重试） */
const listError = ref('')

/** 是否还有更多页：已加载条数少于总数即还有 */
const hasMore = computed(() => files.value.length < total.value)

/**
 * 拉取文件列表
 * @param mode reset 首屏 / 刷新：覆盖列表；append 加载更多：追加到现有列表尾部
 */
async function fetchFiles(mode: 'reset' | 'append' = 'reset'): Promise<void> {
  loading.value = true
  listError.value = ''
  try {
    // 接口默认返回当前用户、状态 READY 的文件，按创建时间倒序；keyword 为展示名模糊搜索
    const result = await fileApi.list({
      page: page.value,
      size: PAGE_SIZE,
      // 空白关键字不传参，避免后端按空串过滤
      keyword: props.keyword?.trim() || undefined,
    })
    // reset 覆盖、append 拼接，加载更多时不打断滚动位置
    files.value = mode === 'reset' ? result.records : [...files.value, ...result.records]
    total.value = result.total
  } catch (e) {
    listError.value = e instanceof ApiError ? e.message : '文件列表加载失败'
  } finally {
    loading.value = false
  }
}

/** 首次进入拉取第一页 */
onMounted(() => {
  void fetchFiles('reset')
})

// 全局搜索关键字变化 → 回第一页重新查询（防抖由搜索框组件负责）
watch(
  () => props.keyword,
  () => {
    page.value = 1
    void fetchFiles('reset')
  },
)

/**
 * 加载下一页并追加到列表
 */
async function loadMore(): Promise<void> {
  page.value += 1
  await fetchFiles('append')
}

/**
 * 刷新列表：回到第一页重新拉取
 */
function refresh(): void {
  page.value = 1
  void fetchFiles('reset')
}

// ==================== 选中 ====================

/**
 * 点击文件项：通知父组件选中该文件
 * @param file 被点击的文件资产
 */
function selectFile(file: FileAsset): void {
  if (props.disabled) return
  // 若有行正在重命名，先退出编辑态，避免点击目标切换后残留输入框
  cancelRename()
  emit('select', file)
}

// ==================== 行级操作：重命名 ====================

/** 正在重命名的文件 ID；null 表示无行处于重命名态 */
const renamingId = ref<number | null>(null)

/** 重命名输入框的双向绑定草稿 */
const renameDraft = ref('')

/** 重命名错误提示 */
const renameError = ref('')

/**
 * 进入重命名态：以当前展示名作为初始草稿
 * @param file 目标文件
 */
function startRename(file: FileAsset): void {
  if (props.disabled) return
  renamingId.value = file.id
  renameDraft.value = file.displayName
  renameError.value = ''
}

/**
 * 退出重命名态（不保存）
 */
function cancelRename(): void {
  renamingId.value = null
  renameError.value = ''
}

/**
 * 确认重命名：校验非空且确有修改后调用接口，成功则原位更新列表项。
 * 回车与失焦都会触发本方法，进入时先退出编辑态以防止重复提交。
 */
async function confirmRename(): Promise<void> {
  if (props.disabled) return
  const id = renamingId.value
  // 已不在编辑态（如 esc 取消后的失焦）则忽略
  if (id === null) {
    return
  }
  // 先退出编辑态：保证回车 + 失焦连续触发时只提交一次
  renamingId.value = null
  const name = renameDraft.value.trim()
  // 非空校验：空名会破坏列表可读性
  if (!name) {
    renameError.value = '文件名不能为空'
    return
  }
  const target = files.value.find((item) => item.id === id)
  // 与现名相同则无需请求
  if (!target || name === target.displayName) {
    return
  }
  try {
    // PUT /file/{id}/name：只改展示名，不影响底层存储与历史版本
    const updated = await fileApi.rename(id, name)
    // 原位替换，保持滚动位置
    files.value = files.value.map((item) => (item.id === id ? updated : item))
  } catch (e) {
    renameError.value = e instanceof ApiError ? e.message : '重命名失败'
  }
}

// ==================== 行级操作：删除 ====================

/** 待二次确认删除的文件 ID；null 表示无删除确认进行中 */
const deleteConfirmId = ref<number | null>(null)

/** 二次确认自动复位的定时器句柄 */
let deleteConfirmTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 删除按钮点击：首次点击进入二次确认态，再次点击执行软删除。
 * 二次确认避免误删；3 秒未确认自动复位。
 * @param file 目标文件
 */
function onDeleteClick(file: FileAsset): void {
  if (props.disabled) return
  // 首次点击：进入确认态并启动自动复位计时
  if (deleteConfirmId.value !== file.id) {
    deleteConfirmId.value = file.id
    // 复位上一次未完成的确认计时，避免串行互相覆盖
    if (deleteConfirmTimer) {
      clearTimeout(deleteConfirmTimer)
    }
    deleteConfirmTimer = setTimeout(() => {
      deleteConfirmId.value = null
    }, 3000)
    return
  }
  // 第二次点击：清除计时并执行删除
  if (deleteConfirmTimer) {
    clearTimeout(deleteConfirmTimer)
  }
  deleteConfirmId.value = null
  void removeFile(file)
}

/**
 * 执行软删除：调用接口成功后从列表移除并通知父组件
 * @param file 目标文件
 */
async function removeFile(file: FileAsset): Promise<void> {
  try {
    // DELETE /file/{id}：软删除，历史记录与磁盘内容保留；重复删除返回成功
    await fileApi.remove(file.id)
    files.value = files.value.filter((item) => item.id !== file.id)
    // 同步总数，避免"加载更多"的 hasMore 判断出错
    total.value = Math.max(0, total.value - 1)
    emit('deleted', file.id)
  } catch (e) {
    listError.value = e instanceof ApiError ? e.message : '删除失败'
  }
}

// ==================== 展示辅助 ====================

/**
 * 依据扩展名映射线稿图标类型
 * @param file 文件资产
 * @returns 图标类型标识
 */
function iconType(file: FileAsset): 'doc' | 'sheet' | 'pdf' | 'image' | 'file' {
  switch (file.extension) {
    case 'docx':
      return 'doc'
    case 'xlsx':
      return 'sheet'
    case 'pdf':
      return 'pdf'
    case 'png':
    case 'jpeg':
    case 'jpg':
    case 'gif':
    case 'bmp':
      return 'image'
    default:
      return 'file'
  }
}

/**
 * 查看版本历史：由工作台打开版本历史弹窗。
 * @param file 目标文件
 */
function onViewVersions(file: FileAsset): void {
  emit('view-versions', file)
}

// 对外暴露刷新方法：主内容区上传成功后父组件调用以同步列表
defineExpose({ refresh })
</script>

<template>
  <div class="file-list">
    <!-- 列表主体：加载 / 错误 / 空 / 数据 四种状态 -->
    <div class="file-list__body">
      <p v-if="loading && files.length === 0" class="file-list__hint">加载中…</p>

      <template v-else-if="listError">
        <p class="file-list__hint" role="alert">{{ listError }}</p>
        <button class="file-list__retry-btn" type="button" @click="refresh">重试</button>
      </template>

      <!-- 空态区分场景：是否因搜索关键字导致 -->
      <p v-else-if="files.length === 0" class="file-list__hint">
        {{ props.keyword ? '未找到匹配的文件' : '暂无文件，请在右侧主内容区上传' }}
      </p>

      <template v-else>
        <div
          v-for="file in files"
          :key="file.id"
          class="file-list__item"
          :class="{ 'file-list__item--active': file.id === currentFileId }"
          @click="selectFile(file)"
        >
          <!-- 文件类型线稿图标：按扩展名切换 -->
          <svg
            v-if="iconType(file) === 'doc'"
            class="file-list__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M7 3h7l4 4v14H7z" />
            <path d="M14 3v4h4" />
            <path d="M10 13h5" />
            <path d="M10 17h5" />
          </svg>
          <svg
            v-else-if="iconType(file) === 'sheet'"
            class="file-list__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="4" width="16" height="16" rx="1" />
            <path d="M4 10h16" />
            <path d="M10 4v16" />
          </svg>
          <svg
            v-else-if="iconType(file) === 'pdf'"
            class="file-list__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M7 3h7l4 4v14H7z" />
            <path d="M14 3v4h4" />
            <path d="M9 16c1-1.5 2-1.5 3 0s2 1.5 3 0" />
          </svg>
          <svg
            v-else-if="iconType(file) === 'image'"
            class="file-list__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="1" />
            <circle cx="9" cy="10" r="1.5" />
            <path d="m5 19 5-5 3 3 4-4 3 3" />
          </svg>
          <svg
            v-else
            class="file-list__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M7 3h7l4 4v14H7z" />
            <path d="M14 3v4h4" />
          </svg>

          <!-- 文件名与时间；重命名态切换为行内输入框 -->
          <div class="file-list__meta">
            <input
              v-if="renamingId === file.id"
              :disabled="disabled"
              v-model="renameDraft"
              class="file-list__rename-input"
              type="text"
              @click.stop
              @keyup.enter="confirmRename"
              @keyup.esc="cancelRename"
              @blur="confirmRename"
            />
            <template v-else>
              <span class="file-list__name" :title="file.displayName">{{ file.displayName }}</span>
              <span class="file-list__time">{{ formatTime(file.createTime) }}</span>
            </template>
          </div>

          <!-- 行级操作：hover 显形；click.stop 防止触发选中 -->
          <div v-if="renamingId !== file.id" class="file-list__actions" @click.stop>
            <!-- 删除：首次点击变"确认删除"，3 秒未确认自动复位 -->
            <button
              class="file-list__action"
              :class="{ 'file-list__action--confirm': deleteConfirmId === file.id }"
              type="button"
              @click="onDeleteClick(file)"
              :disabled="disabled"
            >
              {{ deleteConfirmId === file.id ? '确认删除' : '删除' }}
            </button>
            <button class="file-list__action" type="button" :disabled="disabled" @click="startRename(file)">重命名</button>
            <button class="file-list__action" type="button" :disabled="disabled" @click="onViewVersions(file)">历史</button>
          </div>
        </div>

        <!-- 重命名错误提示（列表尾部统一展示） -->
        <p v-if="renameError" class="file-list__hint" role="alert">{{ renameError }}</p>

        <!-- 加载更多 -->
        <button
          v-if="hasMore"
          class="file-list__more-btn"
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
.file-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.file-list__hint {
  margin: 0;
  padding: $form-gap $input-padding-x;
  color: $ink-soft;
  font-size: $font-size-caption;
  line-height: 1.6;
}

.file-list__retry-btn {
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

.file-list__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.file-list__item {
  display: flex;
  align-items: center;
  gap: $gap-sm;
  padding: $gap-sm $input-padding-x;
  cursor: pointer;
  transition: background-color $transition-fast;

  // hover 时整行浮起一档，同时显出行级操作
  &:hover {
    background-color: $paper-base;

    .file-list__actions {
      opacity: 1;
    }
  }
}

// 选中态：底色浮起 + 左缘一条强调色细线（inset 阴影避免挤压布局）
.file-list__item--active {
  background-color: $paper-base;
  box-shadow: inset 2px 0 0 $accent;
}

.file-list__icon {
  width: 16px; // 列表图标结构尺寸
  height: 16px;
  flex-shrink: 0;
  color: $ink-soft;
}

.file-list__meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.file-list__name {
  font-size: $font-size-body;
  color: $ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-list__time {
  font-size: $font-size-caption;
  color: $ink-soft;
}

.file-list__rename-input {
  width: 100%;
  padding: $input-padding-y $input-padding-x;
  font: inherit;
  font-size: $font-size-body;
  color: inherit;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;

  &:focus-visible {
    outline: none;
    border-color: $ink-soft;
  }
}

.file-list__actions {
  display: flex;
  gap: $gap-xs;
  flex-shrink: 0;
  // 默认隐藏，行 hover 时显形
  opacity: 0;
  transition: opacity $transition-fast;
  // 继承行背景色，盖住下方文件名避免文字穿插
  background-color: inherit;
}

.file-list__action {
  padding: $gap-xs;
  font: inherit;
  font-size: $font-size-caption;
  color: $ink-soft;
  background: none;
  border: none;
  cursor: pointer;
  transition: color $transition-fast;

  &:hover {
    color: $ink;
  }
}

// 删除二次确认态：加重字重提示谨慎操作（按规范不用红色）
.file-list__action--confirm {
  color: $ink;
  font-weight: $weight-medium;
}

.file-list__more-btn {
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
