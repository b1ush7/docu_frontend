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
}>()

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
}>()
</script>

<template>
  <div class="preview-actions">
    <!-- 返回修改：次级线框按钮，始终可用 -->
    <button class="preview-actions__btn preview-actions__btn--back" type="button" :disabled="busy" @click="emit('back')">
      返回修改
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
