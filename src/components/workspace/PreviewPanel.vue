<script setup lang="ts">
/**
 * @component PreviewPanel
 * @description 右侧主内容区"状态二"文稿预览：顶部为"预览文稿"标题与版本标识，
 *              中间为较大的纸面预览卡片，按 DOCX 结构渲染标题 / 段落 / 表格 / 图片元信息。
 *              覆盖三种子状态：生成中（进度 + 当前步骤，来自轮询的任务记录）、
 *              失败（脱敏错误信息，按风格规范用墨色小字）、就绪（结构渲染）。
 *              "返回修改 / 确认生成"按钮由 PreviewActions 组件承担，不在本组件内。
 */
import { computed } from 'vue'
import { formatBytes } from '@/utils/format'
import { taskStatusLabel } from '@/constants/task'
import type { DocBlock, DocxStructure, Task } from '@/api/types'

/** 组件入参 */
const props = defineProps<{
  /** 生成当前预览的任务记录；null 表示无任务上下文 */
  task: Task | null
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

    <!-- 结构加载中 -->
    <p v-else-if="structureLoading" class="preview-panel__hint">文稿加载中…</p>

    <!-- 结构加载失败 -->
    <p v-else-if="structureError" class="preview-panel__hint" role="alert">{{ structureError }}</p>

    <!-- 预览卡片：按结构块渲染 -->
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
