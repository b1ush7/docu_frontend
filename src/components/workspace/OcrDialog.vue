<script setup lang="ts">
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-dialog.css'

import { ElDialog } from 'element-plus'

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
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useOcrCorrections } from '@/composables/useOcrCorrections'
import { saveBlob } from '@/utils/download'
import { buildOcrParams } from '@/utils/ocrOptions'
import type { OcrPage, OcrParams } from '@/api/types'

const props = defineProps<{
  modelValue: boolean
  fileId: number | null
  versionNo: number | null
  extension?: string | null
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()
const { result, pages, dirty, busy, recognizing, saving, organizing, restored, correctionReady,
  error, organized, recognize: runRecognition, saveCorrections: save, organize, exportBlob } = useOcrCorrections(
  () => ({ visible: props.modelValue, fileId: props.fileId, versionNo: props.versionNo }),
)
const options = reactive<OcrParams>({ language: '', dpi: 150, rotationDegrees: 0, enhance: false, denoise: false, sharpen: false, lowLight: false })
const pageText = ref('')
const regionEnabled = ref(false)
const region = reactive({ x: 0, y: 0, width: 100, height: 100 })
const isImage = computed(() => ['png', 'jpg', 'jpeg'].includes(props.extension?.toLowerCase() ?? ''))
async function recognize(): Promise<void> {
  try {
    const params = buildOcrParams({ ...options, region: regionEnabled.value ? { ...region } : undefined }, pageText.value, isImage.value)
    await runRecognition(params)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '识别参数无效' }
}
const reviewCount = computed(() => (result.value?.pages ?? []).filter(p => p.needsReview).length)
function close(): void { emit('update:modelValue', false) }
async function saveCorrections(): Promise<void> {
  if (await save()) ElMessage.success('校正已保存（未创建新版本）')
}
function exportText(): void {
  if (!result.value || busy.value || !correctionReady.value) return
  saveBlob(exportBlob(), `ocr-${props.fileId}-v${props.versionNo}.txt`)
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
    width="min(860px, 96vw)"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="ocr">
      <p class="ocr__hint">
        识别 PDF 扫描页或 PNG/JPEG 图片。识别为同步调用，<strong>不会创建新版本</strong>；保存校正同样不覆盖原文件。
      </p>

      <details class="ocr__options">
        <summary>识别设置</summary>
        <fieldset :disabled="busy">
          <label>语言 <input v-model="options.language" maxlength="32" placeholder="默认；如 chi_sim+eng" /></label>
          <label>页码 <input v-model="pageText" :placeholder="isImage ? '图片只支持第 1 页' : '全部；如 1,3-5'" /></label>
          <label v-if="!isImage">DPI <input v-model.number="options.dpi" type="number" min="100" max="300" /></label>
          <label>旋转 <select v-model.number="options.rotationDegrees"><option v-for="angle in [0,90,180,270]" :key="angle" :value="angle">{{ angle }}°</option></select></label>
          <label><input v-model="options.enhance" type="checkbox" />增强对比度</label>
          <label><input v-model="options.denoise" type="checkbox" />去噪</label>
          <label><input v-model="options.sharpen" type="checkbox" />锐化</label>
          <label><input v-model="options.lowLight" type="checkbox" />低照度提亮</label>
          <label><input v-model="regionEnabled" type="checkbox" />指定识别区域</label>
          <template v-if="regionEnabled">
            <label v-for="(label, key) in { x: '左侧像素', y: '顶部像素', width: '宽度像素', height: '高度像素' }" :key="key">
              {{ label }} <input v-model.number="region[key]" type="number" :min="key === 'x' || key === 'y' ? 0 : 1" />
            </label>
            <p>区域坐标相对于所选 DPI 渲染后的完整页面；图片使用原始像素。</p>
          </template>
        </fieldset>
      </details>

      <div class="ocr__toolbar">
        <button class="ocr__btn" type="button" :disabled="busy" @click="recognize">
          {{ recognizing ? '处理中…' : result ? '重新识别' : '开始识别' }}
        </button>
        <button
          class="ocr__btn"
          type="button"
          :disabled="!result || busy || !correctionReady || (!dirty && restored)"
          @click="saveCorrections"
        >
          {{ saving ? '保存中…' : '保存校正' }}
        </button>
        <button
          class="ocr__btn"
          type="button"
          :disabled="!result || busy || dirty || !restored || !correctionReady"
          @click="organize"
        >
          {{ organizing ? '整理中…' : 'AI 整理' }}
        </button>
        <button class="ocr__btn" type="button" :disabled="!result || busy || !correctionReady" @click="exportText">
          导出纯文本
        </button>
      </div>

      <p v-if="error" class="ocr__hint ocr__hint--error" role="alert">{{ error }}</p>

      <p v-if="result" class="ocr__summary">
        {{ restored ? '已读取已保存校正' : '尚未保存校正' }} · 导出包含当前文本草稿；AI 整理需先保存。<br />
        引擎 {{ result.engine ?? '未知' }} · {{ result.language ?? '默认语言' }} ·
        共 {{ result.totalPages }} 页，识别 {{ result.renderedPages }} 页
        <template v-if="result.truncated"> · 结果被截断</template>
        <template v-if="reviewCount"> · {{ reviewCount }} 页建议人工复核</template>
      </p>

      <div v-if="result" class="ocr__pages">
        <section v-for="(page, index) in result.pages" :key="page.pageNo" class="ocr__page">
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
            v-model="pages[index]!.text"
            :disabled="busy || !correctionReady"
            class="ocr__text"
            rows="6"
            spellcheck="false"
            :placeholder="page.source === 'EMPTY' ? '本页无文字' : '识别文本（可直接修改）'"
          />
          <div v-for="table in pages[index]!.tables" :key="table.tableIndex" class="ocr__table">
            <p>表格 {{ table.tableIndex + 1 }} · {{ table.rows }} 行 × {{ table.columns }} 列（坐标从 1 开始显示）</p>
            <table>
              <thead><tr><th>行</th><th>列</th><th>合并范围</th><th>校正文本</th></tr></thead>
              <tbody><tr v-for="cell in table.cells" :key="`${cell.row}-${cell.column}`">
                <td>{{ cell.row + 1 }}</td><td>{{ cell.column + 1 }}</td>
                <td>{{ cell.rowSpan }} × {{ cell.columnSpan }}</td>
                <td><textarea v-model="cell.text" :aria-label="`第 ${page.pageNo} 页表格 ${table.tableIndex + 1} 第 ${cell.row + 1} 行第 ${cell.column + 1} 列`" :disabled="busy || !correctionReady" rows="2" /></td>
              </tr></tbody>
            </table>
          </div>
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

.ocr__options fieldset { display: flex; flex-wrap: wrap; gap: 12px; border: 1px solid $line; padding: 12px; }
.ocr__options label { display: flex; align-items: center; gap: 6px; }
.ocr__options input:not([type="checkbox"]) { width: 150px; max-width: 100%; }
.ocr__table { overflow-x: auto; }
.ocr__table table { width: 100%; border-collapse: collapse; }
.ocr__table th, .ocr__table td { border: 1px solid $line; padding: 6px; }
.ocr__table textarea { width: 100%; min-width: 180px; box-sizing: border-box; }

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
