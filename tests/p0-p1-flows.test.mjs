import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createRenderer, h, nextTick, reactive, ref, ssrContextKey } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
// OCR 草稿缓存写在 sessionStorage 里，Node 环境没有该对象，这里给一个内存实现
globalThis.sessionStorage = (() => {
  const map = new Map()
  return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key), clear: () => map.clear() }
})()
// 组件在 unmount 时会移除事件监听，桩必须同时提供 removeEventListener，
// 否则清理阶段会抛 "window.removeEventListener is not a function"
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }
let vite, ocrApi, xlsxApi, templateApi, docxApi, fileApi, adminDocsApi, ApiError
const renderer = createRenderer({ createElement: () => ({}), createText: () => ({}),
  createComment: () => ({}), insert() {}, remove() {}, setText() {}, setElementText() {},
  patchProp() {}, parentNode: () => null, nextSibling: () => null })
const flush = async () => { for (let i = 0; i < 15; i++) await nextTick() }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' })
  ;({ ocrApi } = await vite.ssrLoadModule('/src/api/ocr.ts'))
  ;({ xlsxApi } = await vite.ssrLoadModule('/src/api/xlsx.ts'))
  ;({ templateApi } = await vite.ssrLoadModule('/src/api/template.ts'))
  ;({ docxApi } = await vite.ssrLoadModule('/src/api/docx.ts'))
  ;({ fileApi } = await vite.ssrLoadModule('/src/api/file.ts'))
  ;({ adminDocsApi } = await vite.ssrLoadModule('/src/api/admin-content.ts'))
  ;({ ApiError } = await vite.ssrLoadModule('/src/api/http.ts'))
  const { ElMessage } = await import('element-plus')
  ElMessage.success = () => {}; ElMessage.warning = () => {}; ElMessage.error = () => {}
})
after(async () => { await vite?.close() })
async function component(path, initial, plugins = []) {
  const { default: original } = await vite.ssrLoadModule(path)
  const Component = { ...original, render: () => null, ssrRender: undefined }
  const props = reactive(initial), child = ref()
  const app = renderer.createApp({ render: () => h(Component, { ...props, ref: child }) })
  // 被测组件会间接调用 useUserStore()（useCurrentUser / useEditorDraft / useOcrCorrections），
  // 没有 Pinia 会抛 "getActivePinia()"。每个组件挂载都用一份全新 store，避免用例间串味。
  const pinia = createPinia()
  setActivePinia(pinia)
  app.use(pinia)
  app.provide(ssrContextKey, { modules: new Set() })
  plugins.forEach(plugin => app.use(plugin))
  app.mount({})
  await flush()
  return { app, props, state: child.value.$.setupState, instance: child.value.$ }
}
const structure = label => ({ fileId: 1, versionNo: 1, totalSheets: 1, includedCells: 1,
  sheets: [{ name: label, cells: [], mergedRegions: [] }] })
function recognition(fileId = 1) {
  return { fileId, versionNo: 1, fingerprint: 'a'.repeat(64), totalPages: 2, renderedPages: 2,
    pages: [1, 2].map(pageNo => ({ pageNo, text: `原文${pageNo}`, source: 'OCR', tables: [], needsReview: false, confidence: null })) }
}
const correction = (text = '已保存校正') => ({ fingerprint: 'a'.repeat(64), pages: [
  { pageNo: 1, text, tables: [{ tableIndex: 0, rows: 1, columns: 1,
    cells: [{ row: 0, column: 0, rowSpan: 1, columnSpan: 1, text: '保留表格' }] }] },
  { pageNo: 2, text: '', tables: [] },
] })
async function ocrHarness() {
  const { useOcrCorrections } = await vite.ssrLoadModule('/src/composables/useOcrCorrections.ts')
  const context = reactive({ visible: true, fileId: 1, versionNo: 1 })
  let flow
  const app = renderer.createApp({ setup() { flow = useOcrCorrections(() => context); return () => null } })
  // useOcrCorrections 内部使用 useUserStore()，同样需要 Pinia 上下文
  const pinia = createPinia()
  setActivePinia(pinia)
  app.use(pinia)
  // 缓存键包含用户 id：不登录时 cacheKey() 为空串，重开对话框就不会恢复草稿。
  // 所以这里放一个登录用户，并清空上一用例留下的缓存，避免跨用例串数据。
  globalThis.sessionStorage.clear()
  const { useUserStore } = await vite.ssrLoadModule('/src/stores/user.ts')
  useUserStore().user = { id: 1, username: 'tester' }
  app.mount({})
  return { flow, context, app }
}

test('XLSX inline editor loads on first mount and reloads after version changes', async () => {
  const calls = []
  xlsxApi.getStructure = async (file, version) => { calls.push([file, version]); return structure(`v${version}`) }
  const c = await component('/src/components/workspace/XlsxEditor.vue', { modelValue: true, fileId: 1, versionNo: 1 })
  try {
    assert.deepEqual(calls, [[1, 1]])
    assert.equal(c.state.structure.sheets[0].name, 'v1')
    c.props.versionNo = 2; await flush()
    assert.deepEqual(calls, [[1, 1], [1, 2]])
    assert.equal(c.state.structure.sheets[0].name, 'v2')
  } finally { c.app.unmount() }
})
test('XLSX stale structure, range, and failed requests cannot overwrite a newer version', async () => {
  const old = deferred()
  xlsxApi.getStructure = (file, version) => version === 1 ? old.promise : Promise.resolve(structure('new'))
  const c = await component('/src/components/workspace/XlsxEditor.vue', { modelValue: true, fileId: 1, versionNo: 1 })
  try {
    c.props.versionNo = 2; await flush()
    old.resolve(structure('old')); await flush()
    assert.equal(c.state.structure.sheets[0].name, 'new')
    const range = deferred(); xlsxApi.getRange = () => range.promise
    const pending = c.state.loadRange()
    c.props.versionNo = 3; await flush()
    range.reject(new Error('old error')); await pending
    assert.equal(c.state.error, '')
    assert.equal(c.state.rangeResult, null)
  } finally { c.app.unmount() }
})
test('XLSX opens sheet data and saves formulas with cached results requested by default', async () => {
  let body
  xlsxApi.getStructure = async () => structure('数据')
  xlsxApi.editCells = async (file, version, request) => { body = request; return { fileId: file, versionNo: version + 1 } }
  const c = await component('/src/components/workspace/XlsxEditor.vue', { modelValue: true, fileId: 1, versionNo: 1 })
  try {
    assert.deepEqual([...c.state.expandedSheets], ['数据'])
    c.state.ops = [{ type: 'SET_FORMULA', sheetName: '数据', cell: 'A3', formula: 'SUM(A1:A2)' }]
    await c.state.submit()
    assert.equal(body.recalculateFormulas, true)
  } finally { c.app.unmount() }
})

test('XLSX preview opens the data tab on first mount and after confirmation creates a version', async () => {
  const c = await component('/src/components/workspace/PreviewPanel.vue', {
    task: null, changes: [], planStatus: 'NONE', reply: null, structure: null,
    structureLoading: false, structureError: '',
    previewVersion: { fileId: 1, versionNo: 1, extension: 'xlsx' },
  })
  try {
    assert.equal(c.state.viewMode, 'xlsx')
    c.props.previewVersion = { fileId: 1, versionNo: 2, extension: 'xlsx' }; await flush()
    assert.equal(c.state.viewMode, 'xlsx')
    c.props.previewVersion = { fileId: 2, versionNo: 1, extension: 'docx' }; await flush()
    assert.equal(c.state.viewMode, 'page')
  } finally { c.app.unmount() }
})
test('OCR restores saved text and tables, exports the visible draft without recognizing again', async () => {
  let count = 0, body
  ocrApi.recognize = async () => { count++; return recognition() }
  ocrApi.getCorrections = async () => correction()
  ocrApi.saveCorrections = async (file, version, value) => { body = value; return { ...correction(), pages: value.pages } }
  const h = await ocrHarness()
  try {
    await h.flow.recognize()
    assert.equal(h.flow.pages.value[0].text, '已保存校正')
    assert.equal(h.flow.pages.value[1].text, '')
    assert.equal(h.flow.dirty.value, false)
    h.flow.pages.value[0].text = '新草稿'
    assert.equal(await h.flow.exportBlob().text(), '新草稿\n\n表格 1\n保留表格\f')
    assert.equal(count, 1)
    assert.equal(await h.flow.saveCorrections(), true)
    assert.equal(body.fingerprint, 'a'.repeat(64))
    assert.equal(body.pages[0].tables[0].cells[0].text, '保留表格')
    assert.equal(h.flow.dirty.value, false)
    h.context.visible = false; h.context.visible = true
    await flush()
    assert.equal(h.flow.pages.value[0].text, '已保存校正')
    assert.equal(count, 1)
  } finally { h.app.unmount() }
})
test('OCR missing correction is normal; failed reads block overwriting and organization requires a save', async () => {
  ocrApi.recognize = async () => recognition()
  ocrApi.getCorrections = async () => { throw new ApiError(404, '没有校正') }
  let organized = 0
  ocrApi.organizeCorrections = async () => { organized++; return { reply: '整理结果' } }
  ocrApi.saveCorrections = async (file, version, value) => ({ pages: value.pages })
  const h = await ocrHarness()
  try {
    await h.flow.recognize()
    assert.equal(h.flow.correctionReady.value, true)
    await h.flow.organize(); assert.equal(organized, 0)
    await h.flow.saveCorrections(); await h.flow.organize(); assert.equal(organized, 1)
    h.flow.pages.value[0].text = '未保存'
    await h.flow.organize(); assert.equal(organized, 1)
    ocrApi.getCorrections = async () => { throw new ApiError(503, '校正读取失败') }
    await h.flow.recognize()
    assert.equal(h.flow.correctionReady.value, false)
    assert.equal(await h.flow.saveCorrections(), false)
    assert.equal(h.flow.error.value, '校正读取失败')
  } finally { h.app.unmount() }
})
test('OCR ignores late recognition, save, and organize results after switching or closing', async () => {
  const old = deferred(); ocrApi.recognize = () => old.promise
  ocrApi.getCorrections = async () => correction()
  const h = await ocrHarness()
  try {
    const pending = h.flow.recognize()
    h.context.fileId = 2
    ocrApi.recognize = async () => recognition(2)
    await h.flow.recognize()
    old.resolve(recognition(1)); await pending
    assert.equal(h.flow.result.value.fileId, 2)
    const save = deferred(); ocrApi.saveCorrections = () => save.promise
    const saving = h.flow.saveCorrections(); h.context.visible = false
    save.resolve(correction('旧保存')); await saving
    assert.equal(h.flow.result.value, null)
    h.context.visible = true; await flush()
    const organize = deferred(); ocrApi.organizeCorrections = () => organize.promise
    const organizing = h.flow.organize(); h.app.unmount()
    organize.resolve({ reply: '旧整理' }); await organizing
    assert.equal(h.flow.organized.value, '')
  } finally { h.app.unmount() }
})
test('administrator file viewer ignores old versions, metadata, and page images after switching', async () => {
  const list = deferred(), meta = deferred(), page = deferred()
  const version = no => ({ versionNo: no, extension: 'pdf' })
  adminDocsApi.listVersions = file => file === 1 ? list.promise : Promise.resolve([version(2), version(3)])
  adminDocsApi.getPreviewMeta = (file, no) => no === 2 ? meta.promise : Promise.resolve({ previewable: true, pageCount: 1 })
  adminDocsApi.getPageImage = () => page.promise
  const c = await component('/src/components/admin/AdminFileInspectDrawer.vue', { modelValue: true, fileId: 1 })
  try {
    c.props.fileId = 2; await flush()
    list.resolve([version(99)]); await flush()
    assert.equal(c.state.currentVersionNo, 2)
    assert.equal(c.state.loading, true)
    c.state.currentVersionNo = 3; await flush()
    meta.resolve({ previewable: false }); await flush()
    assert.equal(c.state.meta.previewable, true)
    const pending = c.state.loadPage(1)
    c.props.modelValue = false; await flush()
    page.resolve(new Blob(['old'])); await pending
    assert.equal(c.state.pageUrl, '')
    assert.equal(c.state.meta, null)
  } finally { c.app.unmount() }
})
test('template dialog ignores old loads and a generation completed after closing', async () => {
  const old = deferred()
  templateApi.list = () => old.promise
  const c = await component('/src/components/workspace/TemplateGenerateDialog.vue', { modelValue: false })
  try {
    c.props.modelValue = true; await flush()
    c.props.modelValue = false; await flush()
    const template = { id: 7, versionNo: 3, hasFile: true, variables: '[]' }
    templateApi.list = async () => [template]
    c.props.modelValue = true; await flush()
    old.resolve([{ ...template, id: 1 }]); await flush()
    assert.equal(c.state.selectedId, 7)
    const generated = deferred(); let payload
    docxApi.generate = value => { payload = value; return generated.promise }
    const pending = c.state.submit()
    c.props.modelValue = false; await flush()
    generated.resolve({ id: 9, latestVersion: 1 }); await pending
    assert.equal(payload.templateVersion, 3)
    assert.equal(c.instance.emitted?.created, undefined)
  } finally { c.app.unmount() }
})
test('workspace manual edits and template generation keep file, preview, URL, and reload in sync', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const { useUserStore } = await vite.ssrLoadModule('/src/stores/user.ts')
  useUserStore().user = { id: 1, username: 'test' }
  let router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
  await router.push('/?file=1&version=1')
  fileApi.detail = async id => ({ id, displayName: `file-${id}`, latestVersion: id === 1 ? 2 : 1 })
  fileApi.versionDetail = async (id, versionNo) => ({ fileId: id, versionNo, extension: 'docx' })
  docxApi.getStructure = async (id, versionNo) => ({ fileId: id, versionNo, blocks: [] })
  let c = await component('/src/views/WorkspaceView.vue', {}, [pinia, router])
  try {
    await c.state.onVersionCreated({ fileId: 1, versionNo: 2 }); await flush()
    assert.equal(c.state.previewFlow.previewVersion.value.versionNo, 2)
    assert.equal(c.state.selectedFile.latestVersion, 2)
    assert.equal(String(router.currentRoute.value.query.version), '2')
    const savedUrl = router.currentRoute.value.fullPath
    c.app.unmount()
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
    await router.push(savedUrl)
    c = await component('/src/views/WorkspaceView.vue', {}, [pinia, router])
    assert.equal(c.state.previewFlow.previewVersion.value.versionNo, 2)
    c.state.displayedSessionId = 88; c.state.currentTaskId = 77
    await c.state.onTemplateCreated({ id: 9, displayName: 'template.docx', latestVersion: 1 }); await flush()
    assert.equal(c.state.previewFlow.previewVersion.value.fileId, 9)
    assert.equal(c.state.selectedFile.id, 9)
    assert.equal(c.state.currentTaskId, null)
    assert.equal(c.state.displayedSessionId, null)
    assert.equal(String(router.currentRoute.value.query.file), '9')
    assert.equal(String(router.currentRoute.value.query.version), '1')
    assert.equal(router.currentRoute.value.query.aiSession, undefined)
  } finally { c.app.unmount() }
})

test('SSE parser handles byte-sized chunks, CRLF, comments, multiline JSON and an unterminated final event', async () => {
  const { createSseParser } = await vite.ssrLoadModule('/src/utils/sse.ts')
  const events = []
  const parser = createSseParser((name, data) => events.push([name, JSON.parse(data)]))
  const text = ': heartbeat\r\nevent: started\r\ndata: {"replyId":8}\r\n\r\nevent: delta\ndata: {\ndata: "text":"中文"}\n\nevent: completed\r\ndata: {"ok":true}'
  for (const character of text) parser.push(character)
  parser.finish()
  assert.deepEqual(events, [['started', { replyId: 8 }], ['delta', { text: '中文' }], ['completed', { ok: true }]])
})
test('stream transport consumes incremental and final response text once and propagates error events', async () => {
  const { http } = await vite.ssrLoadModule('/src/api/http.ts')
  const { aiApi } = await vite.ssrLoadModule('/src/api/ai.ts')
  const adapter = http.defaults.adapter
  http.defaults.adapter = async config => {
    const partial = 'event: delta\r\ndata: {"text":"你好"}\r\n\r\n'
    config.onDownloadProgress({ event: { target: { responseText: partial.slice(0, 19) } } })
    config.onDownloadProgress({ event: { target: { responseText: partial } } })
    return { status: 200, statusText: 'OK', headers: { 'content-type': 'text/event-stream' }, config,
      data: partial + 'event: error\ndata: {"msg":"服务繁忙"}\n\nevent: completed\ndata: {"planStatus":"NONE"}' }
  }
  try {
    const events = []
    await aiApi.streamReply(1, { content: 'test', idempotencyKey: 'key' }, event => events.push(event))
    assert.deepEqual(events, [{ event: 'delta', text: '你好' }, { event: 'error', message: '服务繁忙' },
      { event: 'completed', reply: { planStatus: 'NONE' } }])
  } finally { http.defaults.adapter = adapter }
})
test('AI flow streams visible text, falls back with the same key, and stops after unmount', async () => {
  const { aiApi } = await vite.ssrLoadModule('/src/api/ai.ts')
  const { usePreviewFlow } = await vite.ssrLoadModule('/src/composables/usePreviewFlow.ts')
  const original = { ...aiApi }
  const reply = { message: { id: 8 }, runStatus: 'COMPLETED', planStatus: 'NONE', changes: [], outputVersion: null }
  aiApi.createSession = async () => ({ id: 4 })
  fileApi.detail = async () => ({ latestVersion: 3 })
  let flow, streamedKey, syncKey, synced = 0, resolveStream
  const app = renderer.createApp({ setup() { flow = usePreviewFlow({ onConfirmed() {} }); return () => null } })
  app.mount({})
  try {
    aiApi.streamReply = async (sid, body, onEvent) => {
      streamedKey = body.idempotencyKey
      onEvent({ event: 'delta', text: '逐字回复' })
      assert.equal(flow.streamText.value, '逐字回复')
      onEvent({ event: 'completed', reply })
    }
    aiApi.generateReply = async (sid, body) => { synced++; syncKey = body.idempotencyKey; return reply }
    await flow.submit(1, '首次')
    assert.equal(synced, 0)
    assert.equal(flow.reply.value.message.id, 8)
    aiApi.streamReply = async (sid, body) => { streamedKey = body.idempotencyKey; throw new Error('断线') }
    await flow.submit(1, '回退')
    assert.equal(synced, 1)
    assert.equal(syncKey, streamedKey)
    let signal, callback
    aiApi.streamReply = (sid, body, onEvent, abort) => { signal = abort; callback = onEvent; return new Promise(resolve => { resolveStream = resolve }) }
    const pending = flow.submit(1, '取消')
    await flush(); app.unmount()
    assert.equal(signal.aborted, true)
    callback({ event: 'delta', text: '过期文本' }); resolveStream(); await pending
    assert.equal(flow.streamText.value, '')
    assert.equal(synced, 1)
  } finally { Object.assign(aiApi, original); app.unmount() }
})

test('DOCX and image editors suppress stale saves, errors, and duplicate submissions', async () => {
  const cases = [
    ['/src/components/workspace/DocxParagraphEditor.vue', 'submitReplace', 'replaceParagraphText', state => {
      state.structure = { blocks: [{ blockId: 'body/p1', type: 'PARAGRAPH', text: 'old' }] }
      state.drafts = { 'body/p1': 'new' }
    }],
    ['/src/components/workspace/DocxFormatEditor.vue', 'submit', 'formatParagraphs', state => {
      state.operations = [{ blockId: 'body/p1', type: 'SET_NORMAL' }]
    }],
    ['/src/components/workspace/DocxTableEditor.vue', 'submit', 'editTable', state => {
      state.operations = [{ blockId: 'body/t1/r1/c1', type: 'SET_CELL_TEXT', text: 'new' }]
    }],
    ['/src/components/workspace/DocxTocImageEditor.vue', 'submitToc', 'createTableOfContents', () => {}],
    ['/src/components/workspace/ImageEditDialog.vue', 'submit', 'editImage', state => {
      state.operations = [{ type: 'ROTATE', angle: 90 }]
    }],
  ]
  docxApi.getStructure = async () => ({ blocks: [] })
  docxApi.getTableOfContents = async () => ({ present: false })
  docxApi.getHeaderFooterLinks = async () => ({ sections: [] })
  docxApi.getFootnotes = async () => ({ footnotes: [] })
  for (const [path, action, apiName, prepare] of cases) {
    const api = apiName === 'editImage' ? fileApi : docxApi
    const pending = deferred(); let count = 0
    api[apiName] = () => { count++; return pending.promise }
    const c = await component(path, { modelValue: false, fileId: 1, versionNo: 1 })
    try {
      c.props.modelValue = true; await flush(); prepare(c.state)
      const saving = c.state[action]()
      await c.state[action]()
      assert.equal(count, 1, path)
      c.props.modelValue = false; await flush()
      pending.resolve({ fileId: 1, versionNo: 2 }); await saving
      assert.equal(c.instance.emitted?.edited, undefined, path)
      assert.equal(c.state.submitting, false, path)
    } finally { c.app.unmount() }
  }
})

test('P2 OCR settings validate page ranges, image pages, DPI, and regions', async () => {
  const { buildOcrParams } = await vite.ssrLoadModule('/src/utils/ocrOptions.ts')
  const options = { language: ' chi_sim+eng ', dpi: 200, enhance: true, rotationDegrees: 90,
    denoise: true, sharpen: true, lowLight: true, region: { x: 2, y: 3, width: 40, height: 50 } }
  const value = buildOcrParams(options, '1,3-5,3', false)
  assert.deepEqual(value.pages, [1, 3, 4, 5])
  assert.equal(value.language, 'chi_sim+eng')
  assert.deepEqual(value.region, options.region)
  assert.equal(buildOcrParams(options, '1', true).dpi, undefined)
  for (const pages of ['abc', '0', '1-51', '5-2', '1001', '1,']) assert.throws(() => buildOcrParams({}, pages, false))
  assert.throws(() => buildOcrParams({}, '2', true))
  assert.throws(() => buildOcrParams({ dpi: 99 }, '', false))
  assert.throws(() => buildOcrParams({ region: { x: -1, y: 0, width: 1, height: 1 } }, '', false))
})
test('P2 OCR table corrections are initialized, saved with spans, restored, and exported', async () => {
  const table = { rows: 2, columns: 2, cells: [
    { row: 0, column: 0, rowSpan: 1, columnSpan: 2, text: '合并标题' },
    { row: 1, column: 0, rowSpan: 1, columnSpan: 1, text: 'A' },
    { row: 1, column: 1, rowSpan: 1, columnSpan: 1, text: 'B' },
  ] }
  let params, saved
  ocrApi.recognize = async (file, version, options) => {
    params = options; const value = recognition(); value.pages[0].tables = [table]; return value
  }
  ocrApi.getCorrections = async () => { if (saved) return saved; throw new ApiError(404, 'none') }
  ocrApi.saveCorrections = async (file, version, body) => { saved = body; return body }
  const h = await ocrHarness()
  try {
    await h.flow.recognize({ pages: [1], dpi: 200, enhance: true })
    assert.deepEqual(params, { pages: [1], dpi: 200, enhance: true })
    h.flow.pages.value[0].tables[0].cells[2].text = '校正B'
    assert.equal(h.flow.dirty.value, true)
    await h.flow.saveCorrections()
    assert.equal(saved.pages[0].tables[0].cells[0].columnSpan, 2)
    assert.match(await h.flow.exportBlob().text(), /合并标题\t\nA\t校正B/)
    h.context.visible = false; h.context.visible = true; await flush()
    assert.equal(h.flow.pages.value[0].tables[0].cells[2].text, '校正B')
  } finally { h.app.unmount() }
})
test('P2 audit time range uses ISO local timestamps and reset clears the filter', async () => {
  const { adminAuditApi } = await vite.ssrLoadModule('/src/api/admin-content.ts')
  const calls = []
  adminAuditApi.list = async params => { calls.push(params); return { records: [], total: 0 } }
  const c = await component('/src/views/AuditLogsView.vue', {})
  try {
    c.state.query.page = 3
    c.state.timeRange = ['2026-10-01T10:00:00', '2026-10-20T18:00:00']
    c.state.search(); await flush()
    assert.equal(calls.at(-1).page, 1)
    assert.equal(calls.at(-1).from, '2026-10-01T10:00:00')
    assert.equal(calls.at(-1).to, '2026-10-20T18:00:00')
    c.state.reset(); await flush()
    assert.equal(calls.at(-1).from, undefined)
    c.state.timeRange = ['2026-10-20T18:00:00', '2026-10-01T10:00:00']
    const count = calls.length; await c.state.load()
    assert.equal(calls.length, count)
    assert.match(c.state.error, /不能早于/)
  } finally { c.app.unmount() }
})
test('P2 workspace exposes admin navigation and revokes other devices without logging out current device', async () => {
  const { ElMessageBox } = await import('element-plus')
  const confirm = ElMessageBox.confirm
  ElMessageBox.confirm = async () => 'confirm'
  const pinia = createPinia(); setActivePinia(pinia)
  const { useUserStore } = await vite.ssrLoadModule('/src/stores/user.ts')
  const account = useUserStore(); account.user = { id: 1, username: 'admin', role: 'ADMIN' }
  let count = 0; account.logoutAll = async () => { count++; return 2 }
  const router = createRouter({ history: createMemoryHistory(), routes: ['/', '/admin'].map(path => ({ path, component: { render: () => null } })) })
  await router.push('/')
  const c = await component('/src/views/WorkspaceView.vue', {}, [pinia, router])
  try {
    await c.state.onUserCommand('logoutAll')
    assert.equal(count, 1); assert.equal(account.user.username, 'admin')
    await c.state.onUserCommand('admin'); assert.equal(router.currentRoute.value.path, '/admin')
    await router.push('/'); account.user.role = 'USER'
    await c.state.onUserCommand('admin'); assert.equal(router.currentRoute.value.path, '/')
  } finally { ElMessageBox.confirm = confirm; c.app.unmount() }
})
