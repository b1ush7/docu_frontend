import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createViteServer } from 'vite'
import { createRenderer, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError } from 'axios'

const values = new Map()
globalThis.localStorage = { getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
globalThis.window = { addEventListener() {} }
let vite, server, transport, token, aiApi, fileApi, docxApi, taskApi, usePreviewFlow, changes,
  useVersionHistory, useAiHistory, useTaskCreation, taskSubmission, downloads
let calls = [], refreshes = 0, refreshFailure = 0, redirects = 0
const pair = { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900, refreshExpiresIn: 6000 }
const json = (response, code, data, msg = '') => {
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({ code, data, msg }))
}
before(async () => {
  server = createHttpServer(async (request, response) => {
    let text = ''
    for await (const chunk of request) text += chunk
    calls.push({ method: request.method, url: request.url, auth: request.headers.authorization, body: text && JSON.parse(text) })
    if (request.url === '/user/refresh') {
      refreshes++
      await new Promise(resolve => setTimeout(resolve, 20))
      if (refreshFailure) { response.statusCode = refreshFailure; json(response, refreshFailure, null, '刷新失败'); return }
      json(response, 0, pair); return
    }
    if (request.url === '/user/login') {
      response.statusCode = 401; json(response, 401, null, '账号或密码错误'); return
    }
    if (request.url === '/business-401' && request.headers.authorization !== 'new-access') {
      json(response, 401, null, '令牌失效'); return
    }
    if (request.url === '/always-401' || request.headers.authorization !== 'new-access') {
      response.statusCode = 401; json(response, 401, null, '令牌失效'); return
    }
    json(response, 0, { ok: true })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  process.env.VITE_API_BASE_URL = `http://127.0.0.1:${server.address().port}`
  vite = await createViteServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' })
  transport = await vite.ssrLoadModule('/src/api/http.ts')
  token = await vite.ssrLoadModule('/src/utils/token.ts')
  ;({ aiApi } = await vite.ssrLoadModule('/src/api/ai.ts'))
  ;({ fileApi } = await vite.ssrLoadModule('/src/api/file.ts'))
  ;({ docxApi } = await vite.ssrLoadModule('/src/api/docx.ts'))
  ;({ usePreviewFlow } = await vite.ssrLoadModule('/src/composables/usePreviewFlow.ts'))
  changes = await vite.ssrLoadModule('/src/utils/aiChanges.ts')
  ;({ taskApi } = await vite.ssrLoadModule('/src/api/task.ts'))
  ;({ useVersionHistory } = await vite.ssrLoadModule('/src/composables/useVersionHistory.ts'))
  ;({ useAiHistory } = await vite.ssrLoadModule('/src/composables/useAiHistory.ts'))
  ;({ useTaskCreation } = await vite.ssrLoadModule('/src/composables/useTaskCreation.ts'))
  taskSubmission = await vite.ssrLoadModule('/src/utils/taskSubmission.ts')
  downloads = await vite.ssrLoadModule('/src/utils/download.ts')
  transport.setUnauthorizedHandler(() => { redirects++ })
})
after(async () => { await vite?.close(); await new Promise(resolve => server.close(resolve)) })
function resetAuth() {
  values.clear(); token.setTokens('old-access', 'old-refresh')
  calls = []; refreshes = 0; refreshFailure = 0; redirects = 0
}
test('all transports share one refresh and preserve raw token headers/envelope conventions', async () => {
  resetAuth()
  const [typed, legacy, management] = await Promise.all([
    transport.getData('/file/list'), transport.default.get('/user/me'), transport.getData('/admin/users'),
  ])
  assert.deepEqual(typed, { ok: true }); assert.deepEqual(legacy.data, { ok: true }); assert.deepEqual(management, { ok: true })
  assert.equal(refreshes, 1)
  assert.equal(token.getRefreshToken(), 'new-refresh')
  assert(calls.every(call => !call.auth?.startsWith('Bearer ')))
})
test('invalid password is returned without refresh/logout', async () => {
  resetAuth()
  await assert.rejects(transport.default.post('/user/login', { account: 'example', password: 'wrong' }), /账号或密码错误/)
  assert.equal(refreshes, 0); assert.equal(redirects, 0)
})
test('business-envelope 401 refreshes and replays once', async () => {
  resetAuth()
  assert.deepEqual(await transport.getData('/business-401'), { ok: true })
  assert.equal(refreshes, 1)
})
test('replayed 401 expires credentials without another refresh', async () => {
  resetAuth()
  await assert.rejects(transport.getData('/always-401'), error => error.code === 401)
  assert.equal(refreshes, 1); assert.equal(token.getAccessToken(), null); assert.equal(redirects, 1)
})
test('transient refresh failure preserves credentials; rejected refresh clears them', async () => {
  resetAuth(); refreshFailure = 503
  await assert.rejects(transport.getData('/file/list'), error => error.code === 503)
  assert.equal(token.getRefreshToken(), 'old-refresh'); assert.equal(redirects, 0)
  refreshFailure = 401
  await assert.rejects(transport.getData('/file/list'), error => error.code === 401)
  assert.equal(token.getRefreshToken(), null); assert.equal(redirects, 1)
})
test('blob download exposes backend JSON failures rather than saving an error file', async () => {
  const original = transport.http.defaults.adapter
  try {
    transport.http.defaults.adapter = async config => {
      const response = { config, status: 422, statusText: 'Unprocessable Content', headers: {},
        data: new Blob([JSON.stringify({ code: 422, msg: '缺少中文字体' })], { type: 'application/json' }) }
      throw new AxiosError('failure', 'ERR_BAD_REQUEST', config, null, response)
    }
    await assert.rejects(transport.getBlob('/file/1/download'), /缺少中文字体/)
  } finally { transport.http.defaults.adapter = original }
})
test('typed refresh updates the authentication store used by both page groups', async () => {
  resetAuth()
  setActivePinia(createPinia())
  const { useUserStore } = await vite.ssrLoadModule('/src/stores/user.ts')
  const account = useUserStore()
  await transport.getData('/file/list')
  assert.equal(account.accessToken, 'new-access')
  account.clearAuth()
  assert.equal(token.getAccessToken(), null)
})
test('management wrappers use the same backend origin and keep their response shape', async () => {
  resetAuth()
  const admin = await vite.ssrLoadModule('/src/api/admin.js')
  const response = await admin.getUsers({ page: 1, size: 20 })
  assert.equal(response.code, 0)
  assert.deepEqual(response.data, { ok: true })
  assert(calls.some(call => call.url === '/admin/users?page=1&size=20'))
  assert.equal(refreshes, 1)
})

const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
  parentNode: () => null, nextSibling: () => null,
})
function harness(extra = {}) {
  let flow, confirmed = 0
  const app = renderer.createApp({ setup() { flow = usePreviewFlow({ ...extra, onConfirmed() { confirmed++ } }); return () => null } })
  app.mount({})
  return { flow, app, get confirmed() { return confirmed } }
}
function pendingReply() {
  return { message: { id: 88, content: '计划', role: 'ASSISTANT', sessionId: 4 },
    runStatus: 'COMPLETED', planStatus: 'PENDING', sourceVersion: 3, outputVersion: null,
    result: { reply: '请确认修改', usage: { elapsedMs: 1 } },
    changes: [{ type: 'NORMALIZE_DOCX_FORMAT', target: 'body', before: '2 个段落', after: '{"fontFamily":"宋体"}' }] }
}
function stubFlow(extension = 'docx') {
  let confirms = 0, structures = 0, requests = []
  aiApi.createSession = async () => ({ id: 4 })
  fileApi.detail = async () => ({ latestVersion: 3 })
  fileApi.versionDetail = async () => ({ extension })
  docxApi.getStructure = async (fileId, versionNo) => { structures++; return { fileId, versionNo, blocks: [] } }
  aiApi.generateReply = async (sid, body) => { requests.push({ sid, body }); return pendingReply() }
  aiApi.confirmReply = async () => { confirms++; return { ...pendingReply(), planStatus: 'CONFIRMED', outputVersion: 4 } }
  aiApi.discardReply = async () => ({ ...pendingReply(), planStatus: 'DISCARDED', changes: [] })
  return { requests, get confirms() { return confirms }, get structures() { return structures } }
}
test('plans bind an explicit source version and confirm once, retaining the output preview', async () => {
  const api = stubFlow(); const h = harness()
  try {
    await h.flow.submit(9, '统一格式')
    assert.equal(api.requests[0].body.versionNo, 3)
    assert(api.requests[0].body.idempotencyKey)
    assert.equal(h.flow.canConfirm.value, true)
    assert.equal(h.flow.previewVersion.value, null)
    await Promise.all([h.flow.confirm(), h.flow.confirm()])
    assert.equal(api.confirms, 1); assert.equal(h.confirmed, 1)
    assert.equal(h.flow.mode.value, 'preview')
    assert.equal(h.flow.previewVersion.value.versionNo, 4)
    assert.equal(h.flow.structure.value.versionNo, 4)
  } finally { h.app.unmount() }
})
test('XLSX confirmations use general preview without requesting DOCX structure', async () => {
  const api = stubFlow('xlsx'); const h = harness()
  try {
    await h.flow.submit(9, '创建图表'); await h.flow.confirm()
    assert.equal(api.structures, 0)
    assert.equal(h.flow.previewVersion.value.extension, 'xlsx')
    assert.equal(h.flow.structure.value, null)
  } finally { h.app.unmount() }
})
test('409 keeps the plan discardable, disables confirmation and shows the conflict', async () => {
  stubFlow(); const h = harness()
  aiApi.confirmReply = async () => { throw new transport.ApiError(409, '版本冲突') }
  try {
    await h.flow.submit(9, '统一格式'); await h.flow.confirm()
    assert.equal(h.flow.canConfirm.value, false); assert.equal(h.flow.canDiscard.value, true)
    assert.match(h.flow.structureError.value, /重新生成/)
    await h.flow.discard()
    assert.equal(h.flow.planStatus.value, 'DISCARDED'); assert.equal(h.confirmed, 0)
  } finally { h.app.unmount() }
})
test('transport retry reuses source version, payload and idempotency key', async () => {
  stubFlow(); const h = harness(); const bodies = []
  aiApi.generateReply = async (_sid, body) => {
    bodies.push(body)
    if (bodies.length === 1) throw new transport.ApiError(-1, '超时')
    return pendingReply()
  }
  try {
    await h.flow.submit(9, '统一格式'); h.flow.back()
    fileApi.detail = async () => ({ latestVersion: 99 })
    await h.flow.submit(9, '统一格式')
    assert.deepEqual(bodies[0], bodies[1]); assert.equal(bodies[1].versionNo, 3)
  } finally { h.app.unmount() }
})
test('failed runs and empty pending changes never enable confirmation', async () => {
  stubFlow(); const h = harness()
  try {
    aiApi.generateReply = async () => ({ ...pendingReply(), runStatus: 'FAILED' })
    await h.flow.submit(9, '失败'); assert.equal(h.flow.canConfirm.value, false)
    aiApi.generateReply = async () => ({ ...pendingReply(), changes: [] })
    await h.flow.submit(9, '空计划'); assert.equal(h.flow.canConfirm.value, false)
  } finally { h.app.unmount() }
})
test('format/image plans display actual settings with unknown-plan fallback', () => {
  assert.match(changes.changeAfter({ type: 'RESIZE_DOCX_IMAGES', after: '{"widthCm":6,"keepAspectRatio":true}' }), /6.*保持比例：是/)
  assert.match(changes.changeAfter({ type: 'INSERT_IMAGE', image: { fileId: 10, versionNo: 2, widthPixels: 300, heightPixels: 200 } }), /300 × 200/)
  assert.match(changes.changeAfter({ type: 'FORMAT_PARAGRAPH', format: { type: 'SET_HEADING', level: 1 } }), /1 级/)
  assert.equal(changes.changeAfter({ type: 'NEW_TYPE', after: 'readable' }), 'readable')
  assert.equal(changes.changeAfter({ type: 'RESIZE_DOCX_IMAGES', after: '{bad' }), '{bad')
})

test('opening a historical version clears the pending UI without confirming or discarding it', async () => {
  const api = stubFlow(); const h = harness()
  let requested
  fileApi.versionDetail = async (fileId, versionNo) => { requested = [fileId, versionNo]; return { extension: 'docx' } }
  try {
    await h.flow.submit(9, '统一格式')
    await h.flow.openVersion(9, 1)
    assert.deepEqual(requested, [9, 1])
    assert.equal(h.flow.previewVersion.value.versionNo, 1)
    assert.equal(h.flow.reply.value, null)
    assert.equal(h.flow.canConfirm.value, false)
    assert.equal(api.confirms, 0)
  } finally { h.app.unmount() }
})
test('a page reload can restore a saved pending reply and confirm its original source version', async () => {
  const api = stubFlow(); const locations = []; const h = harness({ onReplySaved: (...args) => locations.push(args) })
  aiApi.getSession = async () => ({ id: 4, fileId: 9, status: 'ACTIVE' })
  aiApi.getReply = async () => pendingReply()
  try {
    const session = await h.flow.restoreReply(4, 88)
    assert.equal(session.fileId, 9)
    assert.equal(h.flow.reply.value.sourceVersion, 3)
    assert.equal(h.flow.canConfirm.value, true)
    assert.deepEqual(locations[0], [4, 88, 9])
    assert.equal(api.requests.length, 0)
    await h.flow.confirm()
    assert.equal(api.confirms, 1)
    assert.equal(h.flow.previewVersion.value.versionNo, 4)
  } finally { h.app.unmount() }
})
test('archived history is read-only and pure conversations restore without file requests', async () => {
  stubFlow(); const h = harness()
  aiApi.getSession = async () => ({ id: 4, fileId: 9, status: 'ARCHIVED' })
  aiApi.getReply = async () => pendingReply()
  try {
    await h.flow.restoreReply(4, 88)
    assert.equal(h.flow.sessionArchived.value, true)
    assert.equal(h.flow.canConfirm.value, false); assert.equal(h.flow.canDiscard.value, false)
    aiApi.getSession = async () => ({ id: 5, fileId: null, status: 'ACTIVE' })
    aiApi.getReply = async () => ({ ...pendingReply(), planStatus: 'NONE', sourceVersion: null, changes: [] })
    fileApi.versionDetail = async () => { throw new Error('should not read file') }
    await h.flow.restoreReply(5, 88)
    assert.equal(h.flow.activeTask.value.fileId, null)
    assert.equal(h.flow.reply.value.result.reply, '请确认修改')
    assert.equal(h.flow.structureError.value, '')
  } finally { h.app.unmount() }
})
test('a deleted or inaccessible reply clears previous content and exposes the backend error', async () => {
  stubFlow(); const h = harness()
  aiApi.getSession = async () => ({ id: 4, fileId: 9, status: 'ACTIVE' })
  aiApi.getReply = async () => { throw new transport.ApiError(404, '回复不存在') }
  try {
    await h.flow.openVersion(9, 3)
    await assert.rejects(h.flow.restoreReply(4, 88), /回复不存在/)
    assert.equal(h.flow.previewVersion.value, null)
    assert.equal(h.flow.reply.value, null)
    assert.equal(h.flow.busy.value, false)
    assert.match(h.flow.structureError.value, /回复不存在/)
  } finally { h.app.unmount() }
})
test('restored running replies remain polling and are cleaned up when the page unmounts', async () => {
  stubFlow(); const h = harness()
  aiApi.getSession = async () => ({ id: 4, fileId: 9, status: 'ACTIVE' })
  aiApi.getReply = async () => ({ ...pendingReply(), runStatus: 'RUNNING', planStatus: 'NONE', changes: [], result: null })
  try {
    await h.flow.restoreReply(4, 88)
    assert.equal(h.flow.isGenerating.value, true)
    assert.equal(h.flow.canConfirm.value, false)
  } finally { h.app.unmount() }
})
const version = (versionNo, extension = 'docx') => ({ fileId: 9, versionNo, extension, contentType: extension, sizeBytes: 100 })
test('version restore is guarded by the latest version and updates the displayed history', async () => {
  const history = useVersionHistory(); let args
  fileApi.detail = async () => ({ id: 9, latestVersion: 3, displayName: 'file.docx' })
  fileApi.versions = async () => [version(1), version(3), version(2)]
  fileApi.restoreVersion = async (...input) => { args = input; return version(4, 'pdf') }
  await history.load(9)
  assert.deepEqual(history.versions.value.map(item => item.versionNo), [3, 2, 1])
  const restored = await history.restore(1)
  assert.deepEqual(args, [9, 1, 3])
  assert.equal(restored.versionNo, 4)
  assert.equal(history.file.value.latestVersion, 4)
  assert.equal(history.file.value.extension, 'pdf')
})
test('a conflicting restore does not change history or overwrite the expected version', async () => {
  const history = useVersionHistory()
  fileApi.detail = async () => ({ id: 9, latestVersion: 3 })
  fileApi.versions = async () => [version(3), version(1)]
  fileApi.restoreVersion = async () => { throw new transport.ApiError(409, '版本冲突') }
  await history.load(9)
  assert.equal(await history.restore(1), null)
  assert.equal(history.file.value.latestVersion, 3)
  assert.equal(history.versions.value.length, 2)
  assert.match(history.error.value, /版本冲突/)
})
test('late version-history responses cannot replace another selected file', async () => {
  const history = useVersionHistory(); let finish
  fileApi.detail = async fileId => fileId === 9 ? new Promise(resolve => { finish = resolve }) : { id: fileId, latestVersion: 1 }
  fileApi.versions = async () => [version(1)]
  const old = history.load(9)
  await history.load(10)
  finish({ id: 9, latestVersion: 3 }); await old
  assert.equal(history.file.value.id, 10)
})
test('conversation search filters and message selection ignore stale responses and tool internals', async () => {
  const history = useAiHistory(); let params, finish
  aiApi.listSessions = async input => { params = input; return { records: [{ id: 4 }], total: 1 } }
  await history.load({ fileId: 9, keyword: '格式', status: 'ACTIVE', page: 2, size: 10 })
  assert.equal(params.fileId, 9); assert.equal(params.page, 2)
  aiApi.listMessages = async sid => sid === 4 ? new Promise(resolve => { finish = resolve })
    : [{ id: 1, role: 'USER' }, { id: 2, role: 'ASSISTANT' }, { id: 3, role: 'TOOL' }]
  const old = history.select({ id: 4 })
  await history.select({ id: 5 })
  finish([{ id: 100, role: 'USER' }]); await old
  assert.equal(history.selected.value.id, 5)
  assert.deepEqual(history.messages.value.map(message => message.id), [1, 2])
})
test('archiving updates history status; deleting clears the selected conversation', async () => {
  const history = useAiHistory(); const session = { id: 4, status: 'ACTIVE' }
  history.sessions.value = [session]; history.total.value = 1
  aiApi.listMessages = async () => [{ id: 88, role: 'ASSISTANT' }]
  await history.select(session)
  aiApi.archiveSession = async () => ({ ...session, status: 'ARCHIVED' })
  assert.equal(await history.archive(session), true)
  assert.equal(history.selected.value.status, 'ARCHIVED')
  aiApi.deleteSession = async () => null
  assert.equal(await history.remove(session), true)
  assert.equal(history.selected.value, null); assert.equal(history.messages.value.length, 0); assert.equal(history.total.value, 0)
})
test('conversion options follow actual backend capabilities and bind an explicit version', () => {
  assert.deepEqual(taskSubmission.availableTaskTypes('PDF'), ['CONVERT', 'EXPORT'])
  assert.deepEqual(taskSubmission.availableTaskTypes('docx'), ['EXPORT'])
  assert.deepEqual(taskSubmission.availableTaskTypes('png'), [])
  const request = taskSubmission.createTaskRequest(9, version(3, 'pdf'), 'CONVERT', 'LAYOUT', 'intent-1')
  assert.equal(request.inputVersion, 3); assert.equal(request.fileId, 9)
  assert.match(request.instruction, /layout/)
  assert.equal(request.idempotencyKey, 'intent-1')
  assert.throws(() => taskSubmission.createTaskRequest(9, version(3), 'CONVERT', 'EDITABLE', 'invalid'), /不支持/)
})
test('task timeouts reuse the same request and latest version, preventing duplicate submissions', async () => {
  const creation = useTaskCreation(); const bodies = []
  fileApi.detail = async () => ({ id: 9, latestVersion: 3 })
  fileApi.versions = async () => [version(3, 'pdf'), version(1, 'pdf')]
  taskApi.create = async body => { bodies.push(body); if (bodies.length === 1) throw new transport.ApiError(-1, '超时'); return { id: 12, status: 'PENDING' } }
  await creation.load(9); await nextTick()
  assert.equal(creation.canSubmit.value, true)
  assert.equal(await creation.submit(), null)
  const [created, duplicate] = await Promise.all([creation.submit(), creation.submit()])
  assert.equal(created.id, 12); assert.equal(duplicate, null)
  assert.equal(bodies.length, 2)
  assert.deepEqual(bodies[0], bodies[1])
  creation.versionNo.value = 1
  assert.equal(creation.canSubmit.value, false)
})
test('download filenames retain the selected version format after conversion', () => {
  assert.equal(downloads.versionFileName('报告.docx', 2, 'pdf'), '报告-v2.pdf')
  assert.equal(downloads.versionFileName('报告.pdf', 1, 'docx'), '报告-v1.docx')
  assert(!downloads.versionFileName('../报告.docx', 1, 'pdf').includes('/'))
})
