// Local-only browser QA fixture. This script never contacts the deployed backend.
import { createServer } from 'node:http'
import { createServer as createViteServer } from 'vite'
const apiPort = 8941
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${apiPort}`
const user = { id: 700, username: 'local_qa', role: 'USER', status: 'ENABLED', phone: null, balance: 0 }
const assets = [
  { id: 9, displayName: '排版测试.docx', originalName: '排版测试.docx', extension: 'docx', latestVersion: 3 },
  { id: 10, displayName: '转换测试.pdf', originalName: '转换测试.pdf', extension: 'pdf', latestVersion: 1 },
].map(asset => ({ ...asset, sizeBytes: 1234, source: 'UPLOAD', status: 'READY', createTime: '2026-10-19T10:00:00', contentType: asset.extension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
const seedVersions = file => Array.from({ length: file.latestVersion }, (_, index) => ({
  id: file.id * 100 + index + 1, fileId: file.id, versionNo: index + 1, extension: file.extension,
  contentType: file.contentType, sizeBytes: 1234, changeType: index ? 'AI_EDIT' : 'UPLOAD',
  createTime: '2026-10-19T10:00:00', resultSummary: index ? '统一字体和图片尺寸' : '上传文件',
}))
const histories = new Map(assets.map(file => [file.id, seedVersions(file)]))
const versions = file => histories.get(file.id)
function appendVersion(file, extension = file.extension, summary = '恢复历史版本') {
  file.latestVersion++
  file.extension = extension
  file.contentType = extension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const version = { ...seedVersions(file).at(-1), resultSummary: summary }
  histories.get(file.id).push(version)
  return version
}
const session = { id: 4, userId: 700, fileId: 9, title: '统一排版', status: 'ACTIVE', createTime: '2026-10-19T10:00:00', updateTime: '2026-10-19T10:00:00' }
const reply = { message: { id: 88, sessionId: 4, role: 'ASSISTANT', content: '请确认字体修改' }, runStatus: 'COMPLETED', planStatus: 'PENDING', sourceVersion: 3, outputVersion: null,
  result: { reply: '将正文统一为宋体小四。', usage: { elapsedMs: 1 }, verificationNotice: '请在确认后检查版面。', truncated: false },
  changes: [{ type: 'NORMALIZE_DOCX_FORMAT', target: 'body', before: '源版本中匹配 2 个正文段落', after: '{"scope":"BODY","fontFamily":"宋体","fontSizePoints":12}' }] }
let tasks = [], pollCount = 0, sessionDeleted = false
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Request-ID')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') { res.end(); return }
  let text = ''; for await (const part of req) text += part
  let body = {}
  try { body = text ? JSON.parse(text) : {} }
  catch { res.statusCode = 415; res.end('This local fixture only accepts JSON requests'); return }
  const url = new URL(req.url, `http://127.0.0.1:${apiPort}`), path = url.pathname
  const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ code: 0, data, msg: '' })) }
  if (path === '/user/login') return json({ accessToken: 'local-access', refreshToken: 'local-refresh', expiresIn: 900, refreshExpiresIn: 604800 })
  if (path === '/user/me') return json(user)
  if (path === '/file/list') return json({ records: assets, total: assets.length, page: 1, size: 20, pages: 1 })
  const fileMatch = path.match(/^\/file\/(\d+)(?:\/versions(?:\/(\d+))?)?(.*)$/)
  if (fileMatch) {
    const file = assets.find(asset => asset.id === Number(fileMatch[1]))
    const versionNo = Number(fileMatch[2] || file?.latestVersion), suffix = fileMatch[3]
    if (file && suffix === '/restore') return json(appendVersion(file, versions(file)[versionNo - 1].extension))
    if (file && suffix === '/download') { res.setHeader('Content-Type', file.contentType); res.end('local QA download'); return }
    if (file && path.endsWith('/versions')) return json([...versions(file)].reverse())
    if (file && suffix === '/structure') return json({ fileId: file.id, versionNo, blocks: [{ blockId: 'body/p0', type: 'PARAGRAPH', text: `本地测试文档 v${versionNo}`, children: [] }] })
    if (file && suffix === '/preview') return json({ fileId: file.id, versionNo, extension: file.extension, pageCount: 1, previewable: true, dpi: 110, engine: 'local-fixture' })
    if (file && suffix.includes('/pages/')) { res.setHeader('Content-Type', 'image/png'); res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')); return }
    if (file && suffix.startsWith('/compare/')) return json({ fileId: file.id, fromVersion: versionNo, toVersion: Number(suffix.split('/').at(-1)), changes: [], truncated: false })
    if (file && suffix === '') return json(fileMatch[2] ? versions(file)[versionNo - 1] : file)
  }
  if (path === '/ai/sessions' && req.method === 'POST') return json(session)
  if (path === '/ai/sessions') return json({ records: sessionDeleted ? [] : [session], total: sessionDeleted ? 0 : 1, page: 1, size: 10, pages: 1 })
  if (path === '/ai/sessions/4' && req.method === 'DELETE') { sessionDeleted = true; return json(null) }
  if (path === '/ai/sessions/4') return json(session)
  if (path.endsWith('/messages')) return json([{ id: 87, sessionId: 4, role: 'USER', content: '请统一正文格式' }, reply.message])
  if (path.endsWith('/archive')) { session.status = 'ARCHIVED'; return json(session) }
  if (path.endsWith('/confirm')) {
    if (reply.planStatus !== 'CONFIRMED' && reply.sourceVersion !== assets[0].latestVersion) {
      res.statusCode = 409; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ code: 409, msg: '源版本已变化，请重新生成', data: null })); return
    }
    if (reply.planStatus !== 'CONFIRMED') reply.outputVersion = appendVersion(assets[0], 'docx', 'AI 编辑').versionNo
    reply.planStatus = 'CONFIRMED'; return json(reply)
  }
  if (path.endsWith('/discard')) { reply.planStatus = 'DISCARDED'; reply.changes = []; return json(reply) }
  if (path.includes('/replies')) return json(reply)
  if (path === '/task' && req.method === 'POST') {
    tasks.push({ id: 12, ...body, status: 'PENDING', progress: 0, createTime: '2026-10-19T10:00:00', outputVersion: null, cancelRequested: false })
    pollCount = 0; return json(tasks.at(-1))
  }
  if (path === '/task/list') return json({ records: tasks, total: tasks.length, page: 1, size: 20, pages: 1 })
  if (path.startsWith('/task/by-file/')) return json(tasks.filter(task => task.fileId === Number(path.split('/').at(-1))))
  if (path === '/task/12') {
    const task = tasks[0]; pollCount++
    if (pollCount > 1 && task.status !== 'SUCCEEDED') {
      const file = assets.find(asset => asset.id === task.fileId)
      const result = appendVersion(file, task.taskType === 'CONVERT' ? 'docx' : 'pdf', '转换任务完成')
      task.status = 'SUCCEEDED'; task.progress = 100; task.outputVersion = result.versionNo
    }
    return json({ task, steps: [] })
  }
  res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ code: 404, msg: 'Local fixture route not implemented', data: null }))
})
server.listen(apiPort, '127.0.0.1')
const vite = await createViteServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } })
await vite.listen()
console.log('Local UI QA: http://127.0.0.1:5174/docu_frontend/ (mock API 8941; no production requests)')
async function stop() { await vite.close(); server.close(); process.exit(0) }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
