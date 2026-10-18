<script setup lang="ts">
/**
 * @component PreviewPanel
 * @description 右侧主内容区"状态二"文稿预览：顶部为"预览文稿"标题与版本标识，
 *              中间为较大的纸面预览卡片，按 DOCX 结构渲染标题 / 段落 / 表格 / 图片元信息。
 *              覆盖三种子状态：生成中（进度 + 当前步骤，来自轮询的任务记录）、
 *              失败（脱敏错误信息，按风格规范用墨色小字）、就绪（结构渲染）。
 *              "返回修改 / 确认生成"按钮由 PreviewActions 组件承担，不在本组件内。
 */
import { computed, ref } from 'vue'
import { formatBytes } from '@/utils/format'
import { taskStatusLabel } from '@/constants/task'
import PagePreview from './PagePreview.vue'
import { previewApi } from '@/api/preview'
import { ApiError } from '@/api/http'
import type {
  AiChange,
  AiPlanStatus,
  DocBlock,
  DocxStructure,
  Task,
  VersionCompareResult,
} from '@/api/types'

/** 组件入参 */
const props = defineProps<{
  /** 生成当前预览的任务记录；null 表示无任务上下文 */
  task: Task | null
  /** 待确认的内容差异：仅在 planStatus=PENDING 时有值 */
  changes: AiChange[]
  /** 待确认计划状态；只有 CONFIRMED 才会产出新版本 */
  planStatus: AiPlanStatus
  /** 任务成功后读取的输出版本 DOCX 结构 */
  structure: DocxStructure | null
  /** 结构加载中标记 */
  structureLoading: boolean
  /** 结构加载失败提示 */
  structureError: string
}>()

/** 是否处于生成中（排队 / 执行） */
const isGenerating = computed(
  () =>
    props.task !== null &&
    (props.task.status === 'PENDING' || props.task.status === 'RUNNING'),
)

/** 是否任务失败或被取消 */
const isFailed = computed(
  () =>
    props.task !== null &&
    (props.task.status === 'FAILED' || props.task.status === 'CANCELLED'),
)

/**
 * 标题块的 HTML 标签名：HTML 仅支持 h1～h6，更深层级按 h6 渲染
 * @param block 结构块
 * @returns 标签名字符串
 */
function headingTag(block: DocBlock): string {
  const level = block.headingLevel ?? 6
  return `h${Math.min(Math.max(level, 1), 6)}`
}

/**
 * 单元格内文本：取单元格子块中全部段落文本拼接（单元格内图片暂不展示，仅文本）
 * @param cell 单元格结构块
 * @returns 单元格文本
 */
function cellText(cell: DocBlock): string {
  return cell.children
    .filter((child) => child.type === 'PARAGRAPH')
    .map((child) => child.text ?? '')
    .join('\n')
}

/** 修改类型的中文展示名（后端返回的是操作码，前端不做翻译会看不懂） */
const CHANGE_TYPE_LABELS: Record<string, string> = {
  REPLACE_TEXT: '替换文本',
  INSERT_PARAGRAPH: '插入段落',
  DELETE_PARAGRAPH: '删除段落',
  INSERT_TABLE: '插入表格',
  DELETE_TABLE: '删除表格',
  SET_CELL: '修改单元格',
  SET_FORMULA: '设置公式',
  INSERT_IMAGE: '插入图片',
  SET_FORMAT: '设置格式',
  RESTORE: '恢复版本',
}

/**
 * 修改类型展示名；未知类型原样返回，避免新增操作码时显示空白
 * @param type 后端返回的操作码
 */
function changeTypeLabel(type: string): string {
  return CHANGE_TYPE_LABELS[type] ?? type
}

/**
 * 预览方式：
 *   - page      版面预览（后端渲染 PNG，所见即所得）
 *   - structure 结构预览（读块结构，快但排版不精确）
 *   - diff      与上一版本的块级差异（仅 versionNo > 1 可用）
 * 默认版面预览；服务端未启用渲染时 PagePreview 会自行降级提示，用户可切回结构预览。
 */
const viewMode = ref<'page' | 'structure' | 'diff'>('page')

/** 版本比较结果（仅在切到 diff 时加载） */
const compareResult = ref<VersionCompareResult | null>(null)
/** 版本比较加载中 */
const compareLoading = ref(false)
/** 版本比较失败提示 */
const compareError = ref('')

/**
 * 加载与上一版本的差异。
 * 比较接口要求两个版本都明确指定，这里用 versionNo-1 作为基准；
 * 版本 1 没有上一版，因此不提供该页签。
 */
async function loadCompare(): Promise<void> {
  const current = props.structure
  if (!current || current.versionNo <= 1) {
    return
  }
  compareLoading.value = true
  compareError.value = ''
  try {
    compareResult.value = await previewApi.compare(
      current.fileId,
      current.versionNo - 1,
      current.versionNo,
    )
  } catch (e) {
    compareError.value = e instanceof ApiError ? e.message : '版本比较失败'
  } finally {
    compareLoading.value = false
  }
}

/** 切换到某个预览方式，必要时懒加载对应数据 */
function switchView(next: 'page' | 'structure' | 'diff'): void {
  viewMode.value = next
  if (next === 'diff' && compareResult.value === null && !compareLoading.value) {
    void loadCompare()
  }
}

/** 版本差异类型的中文名 */
const COMPARE_TYPE_LABELS: Record<string, string> = {
  ADDED: '新增',
  REMOVED: '删除',
  MODIFIED: '修改',
}

/**
 * 版本差异类型展示名；未知类型原样返回
 * @param type 后端返回的差异类型
 */
function compareTypeLabel(type: string): string {
  return COMPARE_TYPE_LABELS[type] ?? type
}
</script>

<template>
  <div class="preview-panel">
    <!-- 标题行：预览文稿 + 版本/状态标识 -->
    <div class="preview-panel__head">
      <h2 class="preview-panel__title">预览文稿</h2>
      <span v-if="structure" class="preview-panel__version">第 {{ structure.versionNo }} 版</span>
      <span v-else-if="isGenerating && task" class="preview-panel__state">
        {{ taskStatusLabel(task.status) }} {{ task.progress }}%
      </span>

      <!-- 有版本可预览时才显示切换：版面（真实渲染）/ 结构（块结构）/ 差异（与上一版比较） -->
      <div v-if="structure" class="preview-panel__tabs" role="tablist">
        <button
          class="preview-panel__tab"
          :class="{ 'preview-panel__tab--active': viewMode === 'page' }"
          type="button"
          role="tab"
          :aria-selected="viewMode === 'page'"
          @click="switchView('page')"
        >
          版面预览
        </button>
        <button
          class="preview-panel__tab"
          :class="{ 'preview-panel__tab--active': viewMode === 'structure' }"
          type="button"
          role="tab"
          :aria-selected="viewMode === 'structure'"
          @click="switchView('structure')"
        >
          结构预览
        </button>
        <button
          v-if="structure.versionNo > 1"
          class="preview-panel__tab"
          :class="{ 'preview-panel__tab--active': viewMode === 'diff' }"
          type="button"
          role="tab"
          :aria-selected="viewMode === 'diff'"
          @click="switchView('diff')"
        >
          与上一版比较
        </button>
      </div>
    </div>

    <!-- 生成中：进度条 + 当前步骤（轮询驱动） -->
    <template v-if="isGenerating && task">
      <div class="preview-panel__progress">
        <div class="preview-panel__progress-bar" :style="{ width: `${task.progress}%` }" />
      </div>
      <p class="preview-panel__hint">
        正在生成：{{ task.currentStep ?? '等待调度' }}（{{ task.progress }}%）
      </p>
    </template>

    <!-- 失败 / 取消：脱敏错误信息（墨色小字，按规范不用红色） -->
    <div v-else-if="isFailed && task" class="preview-panel__error">
      <p class="preview-panel__error-title">生成{{ task.status === 'CANCELLED' ? '已取消' : '失败' }}</p>
      <p v-if="task.errorMessage" class="preview-panel__error-text">{{ task.errorMessage }}</p>
    </div>

    <!-- 待确认修改：模型给出差异，确认后才写入新版本（此时还没有 structure） -->
    <template v-else-if="planStatus === 'PENDING'">
      <p class="preview-panel__hint">
        已生成 {{ changes.length }} 处修改建议，<strong>确认后才会写入新版本</strong>。
      </p>
      <ul v-if="changes.length" class="preview-panel__changes">
        <li
          v-for="(change, index) in changes"
          :key="`${change.target}-${index}`"
          class="preview-panel__change"
        >
          <p class="preview-panel__change-head">
            <span class="preview-panel__change-type">{{ changeTypeLabel(change.type) }}</span>
            <span class="preview-panel__change-target">{{ change.target }}</span>
          </p>
          <p v-if="change.before" class="preview-panel__change-before">原：{{ change.before }}</p>
          <p v-if="change.after" class="preview-panel__change-after">改：{{ change.after }}</p>
          <p v-if="change.reason" class="preview-panel__change-reason">{{ change.reason }}</p>
        </li>
      </ul>
      <p v-else class="preview-panel__hint">
        模型未返回具体差异，可直接确认或返回修改重新描述要求。
      </p>
    </template>

    <!-- 结构加载中 -->
    <p v-else-if="structureLoading" class="preview-panel__hint">文稿加载中…</p>

    <!-- 结构加载失败 -->
    <p v-else-if="structureError" class="preview-panel__hint" role="alert">{{ structureError }}</p>

    <!-- 版面预览：拿后端渲染的 PNG，字体/页边距/分页所见即所得 -->
    <PagePreview
      v-else-if="structure && viewMode === 'page'"
      :file-id="structure.fileId"
      :version-no="structure.versionNo"
    />

    <!-- 与上一版本比较：块/单元格粒度的差异，truncated 时结果不完整 -->
    <template v-else-if="structure && viewMode === 'diff'">
      <p v-if="compareLoading" class="preview-panel__hint">版本差异加载中…</p>
      <p v-else-if="compareError" class="preview-panel__hint" role="alert">{{ compareError }}</p>
      <template v-else-if="compareResult">
        <p class="preview-panel__hint">
          第 {{ compareResult.fromVersion }} 版 → 第 {{ compareResult.toVersion }} 版，共
          {{ compareResult.changes.length }} 处差异。
          <strong v-if="compareResult.truncated">
            结构读取有上限，差异列表可能不完整。
          </strong>
        </p>
        <ul v-if="compareResult.changes.length" class="preview-panel__changes">
          <li
            v-for="(change, index) in compareResult.changes"
            :key="`${change.key}-${index}`"
            class="preview-panel__change"
          >
            <p class="preview-panel__change-head">
              <span class="preview-panel__change-type">{{ compareTypeLabel(change.type) }}</span>
              <span class="preview-panel__change-target">{{ change.label || change.key }}</span>
            </p>
            <p v-if="change.before" class="preview-panel__change-before">原：{{ change.before }}</p>
            <p v-if="change.after" class="preview-panel__change-after">改：{{ change.after }}</p>
          </li>
        </ul>
        <p v-else class="preview-panel__hint">两个版本内容一致。</p>
      </template>
    </template>

    <!-- 结构预览：按结构块渲染（不依赖服务端渲染能力） -->
    <div v-else-if="structure" class="preview-panel__card">
      <template v-for="block in structure.blocks" :key="block.blockId">
        <!-- 标题块：按层级渲染 h1～h6 -->
        <component
          :is="headingTag(block)"
          v-if="block.type === 'HEADING'"
          :class="`preview-panel__h preview-panel__h${block.headingLevel ?? 6}`"
        >
          {{ block.text }}
        </component>

        <!-- 段落块：空段保留一行高度维持文档结构 -->
        <p v-else-if="block.type === 'PARAGRAPH'" class="preview-panel__p" :class="{ 'preview-panel__p--empty': !block.text }">
          {{ block.text }}
        </p>

        <!-- 图片块：接口仅返回元信息，展示占位标识与文件信息 -->
        <div v-else-if="block.type === 'IMAGE'" class="preview-panel__image">
          <svg
            class="preview-panel__image-icon"
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
          <span class="preview-panel__image-name">{{ block.name ?? '图片' }}</span>
          <span v-if="block.sizeBytes !== null" class="preview-panel__image-size">
            {{ formatBytes(block.sizeBytes) }}
          </span>
        </div>

        <!-- 表格块：行 → 单元格 → 段落文本（单元格内仅渲染文本） -->
        <table v-else-if="block.type === 'TABLE'" class="preview-panel__table">
          <tbody>
            <tr v-for="row in block.children.filter((c) => c.type === 'ROW')" :key="row.blockId">
              <td
                v-for="cell in row.children.filter((c) => c.type === 'CELL')"
                :key="cell.blockId"
                class="preview-panel__cell"
              >
                {{ cellText(cell) }}
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>

    <!-- 兜底：无任何可展示内容 -->
    <p v-else class="preview-panel__hint">暂无可预览的文稿内容</p>
  </div>
</template>

<style scoped lang="scss">
.preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  // 预览内容最佳阅读宽度，与目标要求输入区一致
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}

.preview-panel__head {
  display: flex;
  align-items: baseline;
  gap: $gap-sm;
  padding: $gap-sm 0;
}

.preview-panel__title {
  margin: 0;
  font-size: $font-size-body;
  font-weight: $weight-medium;
  color: $ink;
}

.preview-panel__version,
.preview-panel__state {
  font-size: $font-size-caption;
  color: $ink-soft;
}

.preview-panel__progress {
  height: 3px; // 结构尺寸：预览区细进度条
  background-color: $line;
  border-radius: $radius;
  overflow: hidden;
}

.preview-panel__progress-bar {
  height: 100%;
  background-color: $accent;
  transition: width $transition-fast;
}

.preview-panel__hint {
  margin: $gap-sm 0 0;
  color: $ink-soft;
  font-size: $font-size-caption;
  line-height: 1.6;
}

.preview-panel__error {
  padding: $gap-sm;
  background-color: $paper-base;
  border: $border-w solid $line;
  border-radius: $radius;
}

.preview-panel__error-title {
  margin: 0;
  font-size: $font-size-caption;
  font-weight: $weight-medium;
  color: $ink;
}

.preview-panel__error-text {
  margin: $gap-xs 0 0;
  font-size: $font-size-caption;
  color: $ink;
  line-height: 1.6;
  word-break: break-all;
}

// 预览卡片：纸面卡片，内部自行滚动
.preview-panel__card {
  flex: 1;
  min-height: 0;
  margin: $gap-sm 0;
  padding: $card-padding;
  overflow-y: auto;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
}

// 标题层级：一级最重，逐级递减（纸面风格不使用额外颜色）
.preview-panel__h {
  color: $ink;
  font-weight: $weight-medium;
  margin: $gap-sm 0 $gap-xs;
}

.preview-panel__h1 {
  font-size: $font-size-title;
}

// 二级标题与一级同号但降字重，形成层次
.preview-panel__h2 {
  font-size: $font-size-title;
  font-weight: $weight-normal;
}

.preview-panel__h3,
.preview-panel__h4,
.preview-panel__h5,
.preview-panel__h6 {
  font-size: $font-size-body;
}

.preview-panel__p {
  margin: 0 0 $gap-sm;
  font-size: $font-size-body;
  color: $ink;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;

  // 空段保留一行高度，维持文档段落结构
  &--empty {
    min-height: 1.8em;
  }
}

.preview-panel__image {
  display: flex;
  align-items: center;
  gap: $gap-sm;
  padding: $gap-sm;
  margin: 0 0 $gap-sm;
  background-color: $paper-base;
  border: $border-w solid $line;
  border-radius: $radius;
}

.preview-panel__image-icon {
  width: 20px; // 图片占位图标结构尺寸
  height: 20px;
  color: $ink-soft;
}

.preview-panel__image-name {
  font-size: $font-size-caption;
  color: $ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-panel__image-size {
  flex-shrink: 0;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.preview-panel__table {
  width: 100%;
  margin: 0 0 $gap-sm;
  border-collapse: collapse;
}

.preview-panel__cell {
  padding: $gap-xs $gap-sm;
  border: $border-w solid $line;
  font-size: $font-size-caption;
  color: $ink;
  line-height: 1.6;
  vertical-align: top;
}
</style>

<style scoped lang="scss">
/* 待确认修改列表：确认前就应看到「改了什么」，而不是确认后才发现 */
.preview-panel__changes {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.preview-panel__change {
  padding: $gap-sm;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
}

.preview-panel__change-head {
  display: flex;
  align-items: center;
  gap: $gap-xs;
  margin: 0 0 $gap-xs;
}

.preview-panel__change-type {
  font-size: $font-size-caption;
  font-weight: $weight-medium;
  color: $accent;
}

.preview-panel__change-target {
  font-size: $font-size-caption;
  color: $ink-soft;
}

.preview-panel__change-before,
.preview-panel__change-after,
.preview-panel__change-reason {
  margin: 0;
  font-size: $font-size-body;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* 原文划掉、新文正常色，靠字重与划线区分，不用红绿（沿用墨色体系） */
.preview-panel__change-before {
  color: $ink-soft;
  text-decoration: line-through;
}

.preview-panel__change-after {
  color: $ink;
}

.preview-panel__change-reason {
  margin-top: $gap-xs;
  font-size: $font-size-caption;
  color: $ink-soft;
}

/* 预览方式切换：版面目 / 结构 */
.preview-panel__tabs {
  display: flex;
  gap: $gap-xs;
  margin-left: auto;
}

.preview-panel__tab {
  height: $control-height;
  padding: 0 $gap-sm;
  font: inherit;
  font-size: $font-size-caption;
  color: $ink-soft;
  background-color: transparent;
  border: $border-w solid transparent;
  border-radius: $radius;
  cursor: pointer;
  transition: color $transition-fast, border-color $transition-fast;

  &:hover {
    color: $ink;
  }
}

.preview-panel__tab--active {
  color: $ink;
  background-color: $paper-surface;
  border-color: $line;
}
</style>
