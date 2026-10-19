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
let vite, server, transport, token, aiApi, fileApi, docxApi, usePreviewFlow, changes
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
function harness() {
  let flow, confirmed = 0
  const app = renderer.createApp({ setup() { flow = usePreviewFlow({ onConfirmed() { confirmed++ } }); return () => null } })
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
