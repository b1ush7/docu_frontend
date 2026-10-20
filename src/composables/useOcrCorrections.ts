import { computed, ref, watch } from 'vue'
import { ocrApi } from '@/api/ocr'
import { ApiError } from '@/api/http'
import { useRequestGuard } from './useRequestGuard'
import type { OcrCorrection, OcrPageCorrection, OcrResult, OcrParams } from '@/api/types'

export function useOcrCorrections(context: () => { visible: boolean; fileId: number | null; versionNo: number | null }) {
  const result = ref<OcrResult | null>(null)
  const pages = ref<OcrPageCorrection[]>([])
  const baseline = ref('[]')
  const recognizing = ref(false)
  const saving = ref(false)
  const organizing = ref(false)
  const restored = ref(false)
  const correctionReady = ref(false)
  const error = ref('')
  const organized = ref('')
  const dirty = computed(() => JSON.stringify(pages.value) !== baseline.value)
  const busy = computed(() => recognizing.value || saving.value || organizing.value)
  // Keep only the last recognition in memory; reopening reads corrections from the server.
  let cached: OcrResult | null = null
  const guard = useRequestGuard(() => { const c = context(); return [c.visible, c.fileId, c.versionNo] })
  watch(() => { const c = context(); return [c.visible, c.fileId, c.versionNo] }, () => {
    result.value = null; pages.value = []; baseline.value = '[]'
    error.value = ''; organized.value = ''; restored.value = false; correctionReady.value = false
    recognizing.value = false; saving.value = false; organizing.value = false
    if (context().visible) void restoreCached()
  }, { flush: 'sync' })

  function applySaved(saved: OcrCorrection): void {
    const byPage = new Map(saved.pages.map(p => [p.pageNo, p]))
    pages.value = pages.value.map(p => byPage.get(p.pageNo) ?? p)
    baseline.value = JSON.stringify(pages.value)
    restored.value = true
  }
  async function loadCorrections(value: OcrResult, current: () => boolean): Promise<void> {
    result.value = value
    pages.value = value.pages.map(p => ({
      pageNo: p.pageNo, text: p.text ?? '',
      tables: p.tables.map((table, tableIndex) => ({ tableIndex, rows: table.rows, columns: table.columns,
        cells: table.cells.map(({ row, column, rowSpan, columnSpan, text }) => ({ row, column, rowSpan, columnSpan, text })),
      })),
    }))
    baseline.value = JSON.stringify(pages.value)
    try {
      const saved = await ocrApi.getCorrections(value.fileId, value.versionNo, value.fingerprint)
      if (!current()) return
      applySaved(saved)
    } catch (cause) {
      if (!current()) return
      // Only 404 means no saved corrections. Other failures must not permit overwriting them.
      if (!(cause instanceof ApiError && cause.code === 404)) throw cause
    }
    correctionReady.value = true
    if (!value.pages.length) error.value = '未识别到内容'
  }
  async function restoreCached(): Promise<void> {
    const { fileId, versionNo } = context()
    if (!cached || cached.fileId !== fileId || cached.versionNo !== versionNo) return
    const current = guard()
    recognizing.value = true
    try { await loadCorrections(cached, current) }
    catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : '读取校正失败，请重试' }
    finally { if (current()) recognizing.value = false }
  }
  async function recognize(params?: OcrParams): Promise<void> {
    const { visible, fileId, versionNo } = context()
    if (!visible || fileId === null || versionNo === null || busy.value) return
    const current = guard()
    recognizing.value = true; error.value = ''; organized.value = ''
    result.value = null; pages.value = []; restored.value = false; correctionReady.value = false
    try {
      const value = await ocrApi.recognize(fileId, versionNo, params)
      if (!current()) return
      cached = value
      await loadCorrections(value, current)
    } catch (cause) {
      if (current()) error.value = cause instanceof Error ? cause.message : '识别或读取校正失败，请重试'
    } finally { if (current()) recognizing.value = false }
  }
  async function saveCorrections(): Promise<boolean> {
    const { visible, fileId, versionNo } = context()
    if (!visible || fileId === null || versionNo === null || !result.value || !correctionReady.value || busy.value) return false
    const current = guard()
    const body = {
      fingerprint: result.value.fingerprint,
      pages: pages.value.map(page => ({
        ...page,
        tables: page.tables?.map(table => ({ ...table, cells: table.cells.map(cell => ({ ...cell })) })),
      })),
    }
    saving.value = true; error.value = ''; organized.value = ''
    try {
      const saved = await ocrApi.saveCorrections(fileId, versionNo, body)
      if (!current()) return false
      applySaved(saved)
      return true
    } catch (cause) {
      if (current()) error.value = cause instanceof Error ? cause.message : '保存失败'
      return false
    } finally { if (current()) saving.value = false }
  }
  async function organize(): Promise<void> {
    const { visible, fileId, versionNo } = context()
    if (!visible || fileId === null || versionNo === null || !result.value || busy.value || dirty.value || !restored.value || !correctionReady.value) return
    const current = guard()
    organizing.value = true; error.value = ''; organized.value = ''
    try {
      const run = await ocrApi.organizeCorrections(fileId, versionNo, result.value.fingerprint)
      if (!current()) return
      organized.value = run.reply
        + (run.truncated ? '\n\n（输出被截断，结论可能不完整）' : '')
        + (run.verificationNotice ? `\n\n${run.verificationNotice}` : '')
    } catch (cause) {
      if (current()) error.value = cause instanceof Error ? cause.message : '整理失败'
    } finally { if (current()) organizing.value = false }
  }
  /** Export the visible draft, including unsaved text, without another OCR request. */
  function exportBlob(): Blob {
    const text = pages.value.map(page => {
      const tables = (page.tables ?? []).map(table => {
        const rows = Array.from({ length: table.rows }, () => Array<string>(table.columns).fill(''))
        for (const cell of table.cells) rows[cell.row]![cell.column] = cell.text
        return `表格 ${table.tableIndex + 1}\n` + rows.map(row => row.join('\t')).join('\n')
      })
      return [page.text, ...tables].join('\n\n')
    }).join('\f')
    return new Blob([text], { type: 'text/plain;charset=utf-8' })
  }
  return { result, pages, dirty, busy, recognizing, saving, organizing, restored, correctionReady,
    error, organized, recognize, saveCorrections, organize, exportBlob }
}
