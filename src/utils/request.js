import axios from 'axios'
import { ElMessage } from 'element-plus'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './token'
import { PREVIEW_MODE } from './preview'

// 单例刷新 Promise：多个请求同时 401 时只允许一个真正刷新，其余排队等待
let refreshPromise = null

// X-Request-ID：长度 8-64，仅允许 A-Za-z0-9_.:-
function genRequestId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

const service = axios.create({ timeout: 30000 })

async function forceLogout() {
  clearTokens()
  const { default: router } = await import('../router')
  if (router.currentRoute.value.path !== '/login') {
    ElMessage.warning('登录状态已失效，请重新登录')
    router.push('/login')
  }
}

async function handle401(config) {
  // 只重放一次，禁止无限循环
  if (config._retried) {
    await forceLogout()
    return Promise.reject(new Error('登录状态已失效，请重新登录'))
  }
  config._retried = true
  const rt = getRefreshToken()
  if (!rt) {
    await forceLogout()
    return Promise.reject(new Error('登录状态已失效，请重新登录'))
  }
  try {
    if (!refreshPromise) {
      refreshPromise = axios
        .post('/user/refresh', { refreshToken: rt })
        .then((res) => {
          const body = res.data
          if (!body || body.code !== 0) throw new Error(body?.msg || '刷新登录状态失败')
          setTokens(body.data)
          return body.data.accessToken
        })
        .finally(() => {
          refreshPromise = null
        })
    }
    const newToken = await refreshPromise
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${newToken}`
    return service(config)
  } catch (e) {
    await forceLogout()
    return Promise.reject(e)
  }
}

function buildError(msg, { code, requestId, httpStatus } = {}) {
  const err = new Error(msg || '服务异常，请稍后重试')
  err.code = code
  err.requestId = requestId
  err.httpStatus = httpStatus
  return err
}

// 统一错误提示：优先展示后端 msg，附 X-Request-ID 便于定位
export function showError(err) {
  if (!err) return
  // 【临时】预览模式下接口必然失败，屏蔽错误弹窗保持界面干净，联调前删除
  if (PREVIEW_MODE) return
  const suffix = err.requestId ? `（请求ID: ${err.requestId}）` : ''
  ElMessage.error(`${err.message || '服务异常，请稍后重试'}${suffix}`)
}

service.interceptors.request.use((config) => {
  config.headers = config.headers || {}
  config.headers['X-Request-ID'] = genRequestId()
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

service.interceptors.response.use(
  (response) => {
    // 二进制流（下载/预览）不走统一 JSON 解析
    if (response.config.responseType === 'blob') return response
    const body = response.data
    if (body && typeof body === 'object' && 'code' in body) {
      // 成功判定只看 code === 0，不依赖 msg
      if (body.code === 0) return body
      const err = buildError(body.msg || '操作失败', {
        code: body.code,
        requestId: response.headers['x-request-id'],
        httpStatus: response.status,
      })
      if (!response.config.silent) showError(err)
      return Promise.reject(err)
    }
    return body
  },
  async (error) => {
    const { response, config } = error
    if (response?.status === 401 && config && !config._isRefresh) {
      return handle401(config)
    }
    const status = response?.status
    let msg = response?.data?.msg
    if (!msg) {
      if (status === 403) msg = '无权限执行该操作'
      else if (status === 404) msg = '资源不存在或已删除'
      else if (status === 413) msg = '文件超过大小限制'
      else if (status === 415) msg = '文件内容类型不受支持'
      else if (status === 429) msg = '操作过于频繁，请稍后重试'
      else if (status === 500) msg = '服务异常，请稍后重试'
      else if (status === 502) msg = '外部服务失败，请稍后重试'
      else if (!status) msg = '网络异常，请检查网络连接'
      else msg = '服务异常，请稍后重试'
    }
    const err = buildError(msg, {
      code: response?.data?.code ?? status,
      requestId: response?.headers?.['x-request-id'],
      httpStatus: status,
    })
    if (!config?.silent) showError(err)
    return Promise.reject(err)
  },
)

export default service
