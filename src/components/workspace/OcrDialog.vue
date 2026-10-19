<script setup lang="ts">
/**
 * @component OcrDialog
 * @description OCR 识别、结果查看、逐页人工校正与只读整理（API.md 3.11.1）。
 *
 * 三个必须说清的行为：
 *   1. 识别是**同步**的，不创建版本；结果里的 `fingerprint` 是保存校正的唯一凭据。
 *   2. 保存校正**不覆盖 PDF/图片，也不创建版本**；指纹与当前识别结果不一致时后端返回 409。
 *   3. `整理` 只让文本模型**只读整理**校正内容，同样不产生版本。
 *
 * 为什么不自动识别：需要调用云端视觉模型，有延迟和次数限制，必须由用户显式触发。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ocrApi } from '@/api/ocr'
import { ApiError } from '@/api/http'
import { saveBlob } from '@/utils/download'
import type { OcrPage, OcrResult } from '@/api/types'

const props = defineProps<{
  modelValue: boolean
  fileId: number | null
  versionNo: number | null
  /** 版本扩展名，用于提示与文件名 */
  extension?: string | null
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()

/** 识别结果 */
const result = ref<OcrResult | null>(null)
/** 识别中 */
const recognizing = ref(false)
/** 保存校正中 */
const saving = ref(false)
/** 整理中 */
const organizing = ref(false)
/** 错误提示 */
const error = ref('')
/** 整理结果（只读文本） */
const organized = ref('')

/**
 * 逐页校正草稿：pageNo → 文本。
 * 用对象存而不是直接改 result，便于"放弃修改"和保存后回填。
 */
const draft = ref<Record<number, string>>({})

/** 是否已修改过（用草稿与原始文本对比） */
const dirty = computed(() => {
  const pages = result.value?.pages ?? []
  return pages.some((p) => (draft.value[p.pageNo] ?? p.text ?? '') !== (p.text ?? ''))
})

/** 需要人工复核的页数 */
const reviewCount = computed(
  () => (result.value?.pages ?? []).filter((p) => p.needsReview).length,
)

function close(): void {
  emit('update:modelValue', false)
}

/** 重置本地状态（关闭或换文件时调用） */
function reset(): void {
  result.value = null
  draft.value = {}
  error.value = ''
  organized.value = ''
  recognizing.value = false
  saving.value = false
  organizing.value = false
}

// 换文件/换版本时清空，避免把上一份结果当成当前文件的
watch(
  () => [props.fileId, props.versionNo, props.modelValue],
  ([visible]) => {
    if (!visible) return
    reset()
  },
)

/** 执行识别 */
async function recognize(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  recognizing.value = true
  error.value = ''
  organized.value = ''
  try {
    const value = await ocrApi.recognize(props.fileId, props.versionNo)
    result.value = value
    draft.value = Object.fromEntries(value.pages.map((p) => [p.pageNo, p.text ?? '']))
    if (!value.pages.length) error.value = '未识别到内容'
  } catch (e) {
    // 503：未配置云端 OCR；422：文档本身无法识别；429：超过次数限制
    error.value = e instanceof ApiError ? e.message : '识别失败'
  } finally {
    recognizing.value = false
  }
}

/** 保存逐页人工校正 */
async function saveCorrections(): Promise<void> {
  if (!result.value || props.fileId === null || props.versionNo === null) return
  saving.value = true
  error.value = ''
  try {
    const pages = result.value.pages.map((p) => ({
      pageNo: p.pageNo,
      text: draft.value[p.pageNo] ?? p.text ?? '',
    }))
    const saved = await ocrApi.saveCorrections(props.fileId, props.versionNo, {
      fingerprint: result.value.fingerprint,
      pages,
    })
    // 用服务端返回值回填，确保看到的是真正落库的内容
    const byPage = new Map(saved.pages.map((p) => [p.pageNo, p.text]))
    result.value = {
      ...result.value,
      pages: result.value.pages.map((p) => ({ ...p, text: byPage.get(p.pageNo) ?? p.text })),
    }
    draft.value = Object.fromEntries(result.value.pages.map((p) => [p.pageNo, p.text ?? '']))
    ElMessage.success('校正已保存（未创建新版本）')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

/** 交给文本模型只读整理 */
async function organize(): Promise<void> {
  if (!result.value || props.fileId === null || props.versionNo === null) return
  organizing.value = true
  error.value = ''
  organized.value = ''
  try {
    const run = await ocrApi.organizeCorrections(
      props.fileId,
      props.versionNo,
      result.value.fingerprint,
    )
    organized.value = run.reply
    if (run.truncated) organized.value += '\n\n（输出被截断，结论可能不完整）'
    if (run.verificationNotice) organized.value += `\n\n${run.verificationNotice}`
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '整理失败'
  } finally {
    organizing.value = false
  }
}

/** 导出 UTF-8 纯文本 */
async function exportText(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  try {
    const blob = await ocrApi.exportText(props.fileId, props.versionNo)
    saveBlob(blob, `ocr-v${props.versionNo}.txt`)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '导出失败'
  }
}

/** 页码或来源的展示名 */
function sourceLabel(page: OcrPage): string {
  return { NATIVE: '原生文字', OCR: 'OCR 识别', EMPTY: '空白页' }[page.source] ?? page.source
}
</script>

<template>
  <el-dialog
    append-to-body
    :model-value="modelValue"
    title="OCR 识别与校正"
    width="860px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="ocr">
      <p class="ocr__hint">
        识别 PDF 扫描页或 PNG/JPEG 图片。识别为同步调用，<strong>不会创建新版本</strong>；保存校正同样不覆盖原文件。
      </p>

      <div class="ocr__toolbar">
        <button class="ocr__btn" type="button" :disabled="recognizing" @click="recognize">
          {{ recognizing ? '识别中…' : result ? '重新识别' : '开始识别' }}
        </button>
        <button
          class="ocr__btn"
          type="button"
          :disabled="!result || !dirty || saving"
          @click="saveCorrections"
        >
          {{ saving ? '保存中…' : '保存校正' }}
        </button>
        <button
          class="ocr__btn"
          type="button"
          :disabled="!result || organizing"
          @click="organize"
        >
          {{ organizing ? '整理中…' : 'AI 整理' }}
        </button>
        <button class="ocr__btn" type="button" :disabled="!result" @click="exportText">
          导出纯文本
        </button>
      </div>

      <p v-if="error" class="ocr__hint ocr__hint--error" role="alert">{{ error }}</p>

      <p v-if="result" class="ocr__summary">
        引擎 {{ result.engine ?? '未知' }} · {{ result.language ?? '默认语言' }} ·
        共 {{ result.totalPages }} 页，识别 {{ result.renderedPages }} 页
        <template v-if="result.truncated"> · 结果被截断</template>
        <template v-if="reviewCount"> · {{ reviewCount }} 页建议人工复核</template>
      </p>

      <div v-if="result" class="ocr__pages">
        <section v-for="page in result.pages" :key="page.pageNo" class="ocr__page">
          <header class="ocr__page-head">
            <span class="ocr__page-no">第 {{ page.pageNo }} 页</span>
            <span class="ocr__tag">{{ sourceLabel(page) }}</span>
            <span v-if="page.confidence !== null" class="ocr__tag">
              置信度 {{ page.confidence.toFixed(1) }}
            </span>
            <span v-if="page.needsReview" class="ocr__tag ocr__tag--warn">建议复核</span>
            <span v-if="page.tables.length" class="ocr__tag">
              {{ page.tables.length }} 个表格
            </span>
          </header>
          <textarea
            v-model="draft[page.pageNo]"
            class="ocr__text"
            rows="6"
            spellcheck="false"
            :placeholder="page.source === 'EMPTY' ? '本页无文字' : '识别文本（可直接修改）'"
          />
        </section>
      </div>

      <template v-if="organized">
        <p class="ocr__summary">AI 整理结果（只读，不产生版本）</p>
        <pre class="ocr__organized">{{ organized }}</pre>
      </template>
    </div>

    <template #footer>
      <button class="ocr__btn" type="button" @click="close">关闭</button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.ocr {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  max-height: 68vh;
  overflow-y: auto;
}

.ocr__hint {
  margin: 0;
  font-size: $font-size-body;
  color: $ink-soft;
}

.ocr__hint--error {
  color: $ink;
  font-weight: $weight-medium;
}

.ocr__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: $gap-xs;
}

.ocr__btn {
  height: $control-height;
  padding: 0 $card-padding;
  font: inherit;
  font-size: $font-size-body;
  color: $ink;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: $ink-soft;
  }

  &:disabled {
    opacity: $disabled-opacity;
    cursor: default;
  }
}

.ocr__summary {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.ocr__pages {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
}

.ocr__page {
  padding: $gap-sm;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
}

.ocr__page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $gap-xs;
  margin-bottom: $gap-xs;
}

.ocr__page-no {
  font-size: $font-size-body;
  font-weight: $weight-medium;
}

.ocr__tag {
  font-size: $font-size-caption;
  color: $ink-soft;
}

.ocr__tag--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.ocr__text {
  width: 100%;
  padding: $gap-xs;
  font-family: $font-serif;
  font-size: $font-size-body;
  line-height: 1.7;
  color: $ink;
  background-color: $paper-base;
  border: $border-w solid $line;
  border-radius: $radius;
  resize: vertical;
}

.ocr__organized {
  margin: 0;
  max-height: 240px;
  overflow-y: auto;
  padding: $gap-sm;
  font-family: $font-serif;
  font-size: $font-size-body;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  background-color: $paper-base;
  border: $border-w solid $line;
  border-radius: $radius;
}
</style>
