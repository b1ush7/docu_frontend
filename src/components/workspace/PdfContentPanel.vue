<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { pdfApi } from '@/api/pdf'
import { fileApi } from '@/api/file'
import { useRequestGuard } from '@/composables/useRequestGuard'
import { useEditorDraft } from '@/composables/useEditorDraft'
import { saveBlob } from '@/utils/download'
import DraftNotice from './DraftNotice.vue'
import type { ConvertPdfToDocxParams, PdfContent, PdfPage, Version } from '@/api/types'
const props = defineProps<{ fileId: number; versionNo: number }>()
const emit = defineEmits<{ (e: 'edited', version: Version): void }>()
const content = ref<PdfContent | null>(null)
const loading = ref(false)
const converting = ref(false)
const latestVersion = ref<number | null>(null)
const error = ref('')
const keyword = ref('')
const pageType = ref('ALL')
const pageNo = ref(1)
const mode = ref<ConvertPdfToDocxParams['mode']>('EDITABLE')
const language = ref('')
const instruction = ref('')
const guard = useRequestGuard(() => [props.fileId, props.versionNo])
const labels: Record<PdfPage['type'], string> = { TEXT: '原生文字', SCANNED: '扫描页', MIXED: '图文混合', EMPTY: '空白页' }
const filtered = computed(() => (content.value?.pages ?? []).filter(page =>
  (pageType.value === 'ALL' || page.type === pageType.value) &&
  (!keyword.value.trim() || (page.text ?? '').toLowerCase().includes(keyword.value.trim().toLowerCase())),
))
const selected = computed(() => filtered.value.find(page => page.pageNo === pageNo.value) ?? filtered.value[0])
const draft = useEditorDraft({ name: 'pdf-convert', context: () => `${props.fileId}:${props.versionNo}`, enabled: () => true, busy: () => converting.value,
  read: () => ({ mode: mode.value, language: language.value, instruction: instruction.value }),
  apply: value => { mode.value = value.mode; language.value = value.language; instruction.value = value.instruction },
})
async function load(): Promise<void> {
  const current = guard()
  loading.value = true; error.value = ''; content.value = null; latestVersion.value = null
  try {
    const [result, file] = await Promise.all([pdfApi.getContent(props.fileId, props.versionNo), fileApi.detail(props.fileId)])
    if (!current()) return
    content.value = result; latestVersion.value = file.latestVersion
    pageNo.value = result.pages[0]?.pageNo ?? 1
  } catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : 'PDF 内容读取失败' }
  finally { if (current()) loading.value = false }
}
watch(() => [props.fileId, props.versionNo], () => {
  keyword.value = ''; pageType.value = 'ALL'; mode.value = 'EDITABLE'; language.value = ''; instruction.value = ''; converting.value = false
  void load()
}, { immediate: true })
function exportText(): void {
  if (!content.value) return
  saveBlob(new Blob([content.value.pages.map(page => page.text ?? '').join('\f')], { type: 'text/plain;charset=utf-8' }), `pdf-${props.fileId}-v${props.versionNo}.txt`)
}
async function convert(): Promise<void> {
  if (converting.value || loading.value || latestVersion.value !== props.versionNo) return
  const current = guard('convert')
  const fileId = props.fileId; const versionNo = props.versionNo
  converting.value = true; error.value = ''
  try {
    const version = await pdfApi.convertToDocx(fileId, versionNo, { mode: mode.value,
      ocrLanguage: language.value.trim() || undefined, instruction: instruction.value.trim() || undefined })
    if (!current()) return
    converting.value = false; draft.saved(); emit('edited', version)
  } catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : '转换失败，请稍后重试' }
  finally { if (current()) converting.value = false }
}
</script>
<template>
  <section class="pdf-content">
    <p v-if="loading">正在提取 PDF 原生文字和页面分类…</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" :disabled="loading || converting" @click="load">重新读取</button></p>
    <template v-if="content">
      <p>共 {{ content.totalPages }} 页 · 原生文字 {{ content.textPages }} 页 · 扫描 {{ content.scannedPages }} 页 · 图文混合 {{ content.mixedPages }} 页 · 空白 {{ content.emptyPages }} 页</p>
      <p v-if="content.textTruncated">原生文本已截断，导出只包含当前提取的文字。</p>
      <div class="pdf-content__toolbar">
        <input v-model="keyword" placeholder="搜索原生文字" aria-label="搜索 PDF 原生文字" />
        <select v-model="pageType" aria-label="页面类型"><option value="ALL">所有页面</option><option v-for="(label, type) in labels" :key="type" :value="type">{{ label }}</option></select>
        <button type="button" @click="exportText">导出原生文本</button>
      </div>
      <div class="pdf-content__pages">
        <nav aria-label="PDF 页面列表"><button v-for="page in filtered" :key="page.pageNo" type="button" :aria-pressed="selected?.pageNo === page.pageNo" @click="pageNo = page.pageNo">第 {{ page.pageNo }} 页 · {{ labels[page.type] }}</button></nav>
        <article v-if="selected"><h4>第 {{ selected.pageNo }} 页 · {{ labels[selected.type] }}</h4><p>{{ selected.textCharCount }} 字符 · {{ selected.imageCount }} 张图片 <span v-if="selected.textTruncated">· 本页文本截断</span></p><pre>{{ selected.text || '本页没有原生文字；扫描内容可在 OCR 识别与校正中提取。' }}</pre></article>
        <p v-else>没有符合条件的页面。</p>
      </div>
      <form class="pdf-content__convert" @submit.prevent="convert">
        <h4>转换为 DOCX 新版本</h4>
        <DraftNotice :draft="draft" />
        <fieldset :disabled="converting">
          <label>转换取向 <select v-model="mode"><option value="EDITABLE">优先可编辑</option><option value="LAYOUT">优先保持版面</option></select></label>
          <label>OCR 语言 <input v-model="language" maxlength="32" placeholder="如 chi_sim+eng；留空不启用 OCR" /></label>
          <label>转换说明 <textarea v-model="instruction" maxlength="2000" rows="2" /></label>
          <p>同步转换并创建新版本。无原生文字的页面需要填写 OCR 语言；转换可能耗时，请等待结果。</p>
          <p v-if="latestVersion !== versionNo">当前是历史版本，请切换到最新版本后转换。</p>
          <button type="submit" :disabled="loading || latestVersion !== versionNo">{{ converting ? '转换中…' : '转换并生成新版本' }}</button>
        </fieldset>
      </form>
    </template>
  </section>
</template>
<style scoped>
.pdf-content { display: grid; gap: 12px; padding: 16px; min-width: 0; }
.pdf-content p { margin: 0; }
.pdf-content input, .pdf-content select, .pdf-content button, .pdf-content textarea { font: inherit; max-width: 100%; }
.pdf-content__toolbar { display: flex; flex-wrap: wrap; gap: 8px; }
.pdf-content__pages { display: grid; grid-template-columns: minmax(110px,180px) minmax(0,1fr); gap: 12px; }
.pdf-content nav { max-height: 360px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.pdf-content nav button[aria-pressed="true"] { font-weight: bold; }
.pdf-content article pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 360px; overflow: auto; font: inherit; }
.pdf-content__convert fieldset { display: grid; gap: 10px; border: 1px solid #ccc; }
.pdf-content__convert label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
@media(max-width: 600px) { .pdf-content__pages { grid-template-columns: 1fr; } .pdf-content nav { max-height: 130px; } }
</style>
