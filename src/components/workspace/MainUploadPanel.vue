<script setup lang="ts">
/**
 * @component MainUploadPanel
 * @description 右侧主内容区"状态一"面板：未选中文件 / 未生成预览时展示。
 *              上方为居中的大上传按钮（带线稿上传图标，点击选择文件并调用上传接口），
 *              下方为"目标要求"输入区，用于输入对文档的 AI 编辑指令。
 *              上传交互（选择 / 预校验 / 进度 / 错误）复用 useFileUpload 组合逻辑；
 *              上传成功与指令提交均通过事件抛给父组件，
 *              文件列表刷新与 AI_EDIT 任务创建、轮询由 workspace store 接入后统一处理。
 */
import { ref, watch } from 'vue'
import DraftNotice from './DraftNotice.vue'
import { useEditorDraft } from '@/composables/useEditorDraft'
import { useFileUpload } from '@/composables/useFileUpload'
import type { FileAsset } from '@/api/types'

/** 组件入参 */
const props = defineProps<{
  /** 是否已具备可编辑文件：未上传且未选中文件时禁用"生成文稿" */
  active?: boolean
  fileId?: number | null
  hasFile?: boolean
  fileName?: string
  busy?: boolean
}>()

/** 组件对外事件 */
const emit = defineEmits<{
  /** 上传成功：携带服务端返回的新文件资产 */
  (e: 'uploaded', file: FileAsset): void
  /** 提交目标要求：携带用户输入的编辑指令 */
  (e: 'submit', instruction: string): void
}>()

// 上传交互复用组合逻辑：选择 / 预校验 / 进度 / 错误提示
// （file input 由组合函数经 useTemplateRef 绑定，模板 ref 名固定为 file-upload-input）
const { uploading, progress, error: uploadError, ACCEPT_TYPES, triggerFileSelect, onFileChange } =
  useFileUpload({
    // 上传成功直接向上抛出，由父组件刷新列表并选中新文件
    onUploaded: (asset) => emit('uploaded', asset),
  })

/** 用户输入的目标要求（AI 编辑指令） */
const instruction = ref('')

/** 指令校验错误提示 */
const instructionError = ref('')

/** 目标要求最大长度：与 API.md 任务 instruction 字段约束一致 */
const INSTRUCTION_MAX_LENGTH = 2000

/**
 * 提交目标要求：校验非空后抛给父组件（后续由 store 创建 AI_EDIT 任务并轮询）
 */
function submitInstruction(): void {
  const trimmed = instruction.value.trim()
  // 非空校验：纯空白指令无法构成有效的编辑任务
  if (!trimmed) {
    instructionError.value = '请输入目标要求'
    return
  }
  instructionError.value = ''
  emit('submit', trimmed)
}

/**
 * 清除指令校验错误：用户重新输入时自动消除提示
 */
function clearInstructionError(): void {
  if (instructionError.value) {
    instructionError.value = ''
  }
}
watch(() => props.fileId, () => { instruction.value = ''; instructionError.value = '' }, { flush: 'sync' })
const editorDraft = useEditorDraft({
  busy: () => uploading.value || !!props.busy,
  name: 'instruction', context: () => String(props.fileId ?? 'new'), enabled: () => props.active !== false,
  read: () => ({ instruction: instruction.value }), apply: value => { instruction.value = value.instruction },
})
</script>

<template>
  <div class="upload-panel">
    <DraftNotice :draft="editorDraft" />
    <!-- 上传入口：居中大按钮，线稿风格上传图标 -->
    <button
      class="upload-panel__upload-btn"
      type="button"
      :disabled="uploading || busy"
      @click="triggerFileSelect"
    >
      <svg
        class="upload-panel__upload-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <span class="upload-panel__upload-text">
        {{ uploading ? `上传中 ${progress}%` : '上传文件' }}
      </span>
    </button>

    <!-- 上传进度条：细线样式，随进度增长 -->
    <div v-if="uploading" class="upload-panel__progress">
      <div class="upload-panel__progress-bar" :style="{ width: `${progress}%` }" />
    </div>

    <!-- 上传错误提示：控件正下方内联展示，12px 墨色，按规范不用红色 -->
    <p v-if="uploadError" class="upload-panel__error" role="alert">{{ uploadError }}</p>

    <!-- 隐藏文件选择框：accept 限定常见文档格式；ref 名与组合函数约定一致 -->
    <input
      ref="file-upload-input"
      class="upload-panel__file-input"
      type="file"
      :accept="ACCEPT_TYPES"
      @change="onFileChange"
    />

    <!-- 目标要求输入区 -->
    <section class="upload-panel__instruction">
      <p v-if="hasFile">当前文件：{{ fileName || '已选中文件' }}。新的 AI 修改将基于该文件最新版本。</p>
      <label class="upload-panel__label" for="goal-input">目标要求：</label>
      <textarea
        id="goal-input"
        v-model="instruction"
        class="upload-panel__textarea"
        :maxlength="INSTRUCTION_MAX_LENGTH"
        placeholder="例：把第二段改写得更正式，保留表格与图片"
        @input="clearInstructionError"
      />
      <p v-if="instructionError" class="upload-panel__error" role="alert">{{ instructionError }}</p>
      <button
        class="upload-panel__submit-btn"
        type="button"
        :disabled="uploading || busy || !instruction.trim() || !hasFile"
        @click="submitInstruction"
      >
        生成文稿
      </button>
      <!-- 未选择文件提示：与禁用按钮联动，指引用户先完成上传 -->
      <p v-if="!hasFile" class="upload-panel__error">请先上传文件后再生成文稿</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.upload-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  // 顶部留白三倍：上传区在主区明显下移，形成呼吸感
  padding: calc(#{$card-padding} * 3) $card-padding $card-padding;
}

.upload-panel__upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $gap-sm;
  // 大按钮的面板专属布局尺寸（结构尺寸，非全局变量范畴）
  min-width: 200px;
  padding: $form-gap $card-padding;
  // 手写控件必须显式继承字体与颜色，避免浏览器默认样式
  font: inherit;
  color: inherit;
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

.upload-panel__upload-icon {
  width: 28px; // 面板专属图标结构尺寸
  height: 28px;
  color: $ink;
}

.upload-panel__upload-text {
  font-size: $font-size-body;
}

.upload-panel__progress {
  // 与上传按钮同宽的细线进度条
  width: 200px;
  height: 2px; // 结构尺寸
  margin-top: $gap-sm;
  background-color: $line;
  border-radius: $radius;
  overflow: hidden;
}

.upload-panel__progress-bar {
  height: 100%;
  background-color: $accent;
  transition: width $transition-fast;
}

.upload-panel__error {
  margin: $gap-xs 0 0;
  // 错误提示使用墨色小字，风格规范要求不使用红色
  color: $ink;
  font-size: $font-size-caption;
  line-height: 1.4;
}

.upload-panel__file-input {
  display: none;
}

.upload-panel__instruction {
  display: flex;
  flex-direction: column;
  width: 100%;
  // 输入区最佳阅读宽度（结构尺寸）
  max-width: 520px;
  // 与上方上传按钮拉开明显间隔，两个功能块各自独立
  margin-top: calc(#{$form-gap} * 2);
}

.upload-panel__label {
  font-size: $font-size-body;
  font-weight: $weight-medium;
  color: $ink;
}

.upload-panel__textarea {
  margin-top: $gap-sm;
  padding: $input-padding-y $input-padding-x;
  min-height: 96px; // 结构尺寸：约三行的输入空间
  font: inherit;
  color: inherit;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
  resize: vertical;
  transition: border-color $transition-fast;

  &::placeholder {
    color: $ink-soft;
  }

  &:focus-visible {
    outline: none;
    border-color: $ink-soft;
  }
}

.upload-panel__submit-btn {
  margin-top: $form-gap;
  height: $control-height;
  padding: 0 $card-padding;
  font: inherit;
  font-size: $font-size-body;
  // 强调色按钮底配纸面色文字，保证对比度
  color: $paper-surface;
  background-color: $accent;
  border: none;
  border-radius: $radius;
  cursor: pointer;
  transition: background-color $transition-fast, opacity $transition-fast;

  &:hover:not(:disabled) {
    background-color: $accent-hover;
  }

  &:disabled {
    opacity: $disabled-opacity;
    cursor: default;
  }
}
</style>
