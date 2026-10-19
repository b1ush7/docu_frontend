<script setup lang="ts">
/**
 * @component PreviewActions
 * @description 右侧预览态底部操作按钮组：左侧"返回修改"（回到目标要求输入态继续调整），
 *              右侧"确认生成"（确认保存当前输出版本，触发后续版本确认逻辑）。
 *              仅任务成功且文稿结构就绪时允许"确认生成"；生成中 / 失败态只保留"返回修改"。
 */
/** 组件入参 */
defineProps<{
  /** 是否允许确认生成：存在待确认计划（planStatus=PENDING）时可确认 */
  canConfirm: boolean
  /** 是否允许放弃修改：与 canConfirm 同源，已确认或已放弃后不可再操作 */
  canDiscard: boolean
  /** 是否允许导出 PDF：已渲染出明确版本时才可用 */
  canExport: boolean
  busy: boolean
  /** 是否允许 OCR：当前版本是 PDF 或图片时可用 */
  canOcr: boolean
  /** 是否允许图片编辑：当前版本是 PNG/JPEG 时可用 */
  canImageEdit: boolean
  /** 是否允许 DOCX 段落编辑：当前版本是 DOCX 时可用 */
  canEditDocx: boolean
  /** 是否允许 DOCX 段落格式编辑：当前版本是 DOCX 时可用 */
  canFormatDocx: boolean
  /** 是否允许 DOCX 表格编辑：当前版本是 DOCX 时可用 */
  canEditTable: boolean
  /** 是否允许 DOCX 目录域与内嵌图片：当前版本是 DOCX 时可用 */
  canTocImage: boolean}>()

/** 组件对外事件 */
const emit = defineEmits<{
  /** 点击返回修改 */
  (e: 'back'): void
  /** 点击确认生成（仅在 canConfirm 为 true 时按钮可点击） */
  (e: 'confirm'): void
  /** 点击放弃修改（不产生版本，仅在 canDiscard 为 true 时按钮可点击） */
  (e: 'discard'): void
  /** 点击导出 PDF（仅在 canExport 为 true 时按钮可点击） */
  (e: 'export'): void
  /** 点击 OCR 识别（仅在 canOcr 为 true 时按钮可点击） */
  (e: 'ocr'): void
  /** 点击图片编辑（仅在 canImageEdit 为 true 时按钮可点击） */
  (e: 'image-edit'): void
  /** 点击 DOCX 段落编辑（仅在 canEditDocx 为 true 时按钮可点击） */
  (e: 'docx-edit'): void
  /** 点击 DOCX 段落格式（仅在 canFormatDocx 为 true 时按钮可点击） */
  (e: 'docx-format'): void
  /** 点击 DOCX 表格编辑（仅在 canEditTable 为 true 时按钮可点击） */
  (e: 'table-edit'): void
  /** 点击 DOCX 目录/图片（仅在 canTocImage 为 true 时按钮可点击） */
  (e: 'toc-image'): void
}>()
</script>

<template>
  <div class="preview-actions">
    <!-- 返回修改：次级线框按钮，始终可用 -->
    <button class="preview-actions__btn preview-actions__btn--back" type="button" :disabled="busy" @click="emit('back')">
      返回修改
    </button>

    <!-- DOCX 段落编辑：替换文本 / 插入删除段落，提交后创建新版本 -->
    <button
      class="preview-actions__btn preview-actions__btn--export"
      type="button"
      :disabled="!canEditDocx || busy"
      @click="emit('docx-edit')"
    >
      段落编辑
    </button>

    <!-- DOCX 段落格式：标题 / 列表 / 段前分页 -->
    <button
      class="preview-actions__btn preview-actions__btn--export"
      type="button"
      :disabled="!canFormatDocx || busy"
      @click="emit('docx-format')"
    >
      段落格式
    </button>

    <!-- DOCX 表格编辑：单元格文本 / 增删行 / 行高列宽 / 合并拆分 / 重复表头 -->
    <button
      class="preview-actions__btn preview-actions__btn--export"
      type="button"
      :disabled="!canEditTable || busy"
      @click="emit('table-edit')"
    >
      表格编辑
    </button>

    <!-- DOCX 目录域与内嵌图片 -->
    <button
      class="preview-actions__btn preview-actions__btn--export"
      type="button"
      :disabled="!canTocImage || busy"
      @click="emit('toc-image')"
    >
      目录／图片
    </button>

    <!-- OCR：对 PDF 扫描页或图片做识别，不产生版本 -->
    <button
      class="preview-actions__btn preview-actions__btn--export"
      type="button"
      :disabled="!canOcr || busy"
      @click="emit('ocr')"
    >
      OCR 识别
    </button>

    <!-- 图片编辑：裁剪/缩放/旋转/亮度/文字，提交后创建新版本 -->
    <button
      class="preview-actions__btn preview-actions__btn--export"
      type="button"
      :disabled="!canImageEdit || busy"
      @click="emit('image-edit')"
    >
      图片编辑
    </button>

    <!-- 导出 PDF：把当前版本导出为 PDF，不影响版本记录 -->
    <button
      class="preview-actions__btn preview-actions__btn--export"
      type="button"
      :disabled="!canExport"
      @click="emit('export')"
    >
      导出 PDF
    </button>

    <!-- 放弃修改：放弃待确认计划，不产生版本；确认/放弃互斥 -->
    <button
      class="preview-actions__btn preview-actions__btn--discard"
      type="button"
      :disabled="!canDiscard"
      @click="emit('discard')"
    >
      放弃修改
    </button>

    <!-- 确认生成：强调色主按钮，仅在存在待确认计划时可用 -->
    <button
      class="preview-actions__btn preview-actions__btn--confirm"
      type="button"
      :disabled="!canConfirm"
      @click="emit('confirm')"
    >
      确认生成
    </button>
  </div>
</template>

<style scoped lang="scss">
.preview-actions {
  display: flex;
  justify-content: space-between;
  gap: $gap-sm;
  padding: $gap-sm 0 $gap-sm;
}

.preview-actions__btn {
  min-width: 96px; // 结构尺寸：保证两按钮视觉均衡
  height: $control-height;
  padding: 0 $card-padding;
  font: inherit;
  font-size: $font-size-body;
  border-radius: $radius;
  cursor: pointer;
  transition: background-color $transition-fast, border-color $transition-fast, opacity $transition-fast;

  &:disabled {
    opacity: $disabled-opacity;
    cursor: default;
  }
}

// 返回修改：线框次级按钮
.preview-actions__btn--back {
  color: $ink;
  background-color: $paper-surface;
  border: $border-w solid $line;

  &:hover:not(:disabled) {
    border-color: $ink-soft;
  }
}

// 导出 PDF：线框次级按钮，成功后才产生下载，不改变版本
.preview-actions__btn--export {
  color: $ink;
  background-color: $paper-surface;
  border: $border-w solid $line;

  &:hover:not(:disabled) {
    border-color: $ink-soft;
  }
}

// 放弃修改：虚线线框次级按钮，刻意弱于主操作，降低误触
.preview-actions__btn--discard {
  color: $ink-soft;
  background-color: transparent;
  border: $border-w dashed $line;

  &:hover:not(:disabled) {
    color: $ink;
    border-color: $ink-soft;
  }
}

// 确认生成：强调色主按钮
.preview-actions__btn--confirm {
  color: $paper-surface;
  background-color: $accent;
  border: none;

  &:hover:not(:disabled) {
    background-color: $accent-hover;
  }
}
</style>
