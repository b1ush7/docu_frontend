/**
 * @file http.ts
 * @description 全局 Axios 实例，严格对齐《前端联调文档》通用约定（§0）。
 *
 *              · 统一响应体 { code, msg, data }：code === 0 成功，否则失败；
 *                **成功判定只看 code，不依赖 msg**（§0.2）；
 *              · 请求头自动携带 Authorization: Bearer <accessToken>，
 *                并生成 X-Request-ID（§0.1，服务端日志按该 ID 串联）；
 *              · HTTP 401 → 触发 Token 刷新流程（§0.5）：互斥、只重放一次、
 *                失败则清空凭证并跳登录页；
 *              · 404 统一提示"资源不存在或已删除"，**绝不提示"无权限"**（§0.4）；
 *              · 二进制流（下载 / PDF 预览）不做 JSON 判定，直接返回 Blob（§6.4）。
 *
 *              本模块不反向依赖 store / router，二者通过 bindAuth 与
 *              setUnauthorizedHandler 注入，避免循环依赖。
 */
import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'

import type { TokenPair } from '@/types/user'

/** 后端统一响应体结构（§0.2）：错误信息字段为 msg */
export interface ApiResponse<T = unknown> {
  code: number
  msg?: string
  data: T
}

/** 为 axios 配置附加自定义字段（重放标记、请求追踪 ID） */
declare module 'axios' {
  export interface InternalAxiosRequestConfig<D = unknown> {
    /** 已重放过一次，防止无限循环（§0.5 要点 2） */
    _retried?: boolean
    /** 本次请求的追踪 ID，回显在错误提示中（§6.3） */
    requestId?: string
    /** 认证类接口标记：不参与 401 刷新重放，避免自刷新死循环 */
    _skipAuthRefresh?: boolean
  }
}

/** 认证桥接：由 user store 注入，http 模块借它读写 Token */
export interface AuthBridge {
  getAccessToken: () => string | null
  getRefreshToken: () => string | null
  setTokens: (tokens: TokenPair) => void
  clearAuth: () => void
}

let authBridge: AuthBridge | null = null

/** 由 stores/user.ts 注入 Token 存取能力 */
export function bindAuth(bridge: AuthBridge): void {
  authBridge = bridge
}

let redirectToLogin: (() => void) | null = null

/** 由 main.ts 在 app.use(router) 后注入，供 401 失效跳转登录页 */
export function setUnauthorizedHandler(handler: () => void): void {
  redirectToLogin = handler
}

const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
})

/** 仅用于刷新 Token 的裸实例：不挂拦截器，避免刷新请求自身触发 401 递归 */
const rawHttp: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
})

/** 生成符合 §0.1 约束（8-64 位、A-Za-z0-9_.:-）的请求追踪 ID */
function genRequestId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `req-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`
  }
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authBridge?.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  config.requestId = genRequestId()
  config.headers['X-Request-ID'] = config.requestId
  return config
})

/** 组装错误文案：优先用后端 msg，404 强制统一话术，并回显请求 ID */
function composeErrorMessage(error: AxiosError<ApiResponse>): string {
  const status = error.response?.status
  const body = error.response?.data
  let base: string

  if (body?.msg) {
    base = body.msg
  } else if (status === 404) {
    base = '资源不存在或已删除'
  } else if (status === 403) {
    base = '没有权限执行该操作'
  } else {
    base = error.message || '网络异常，请稍后重试'
  }

  // §0.4：404 一律不提示"无权限"，避免泄露资源真实存在
  if (status === 404 && base.includes('权限')) {
    base = '资源不存在或已删除'
  }

  const rid = error.config?.requestId
  return rid ? `${base}（请求 ID：${rid}）` : base
}

/** 刷新互斥：并发 401 只允许一个真正刷新，其余复用同一 Promise（§0.5 要点 1） */
let refreshPromise: Promise<TokenPair> | null = null

/** 执行刷新：成功后写入本地双 Token 并返回新 TokenPair */
function performRefresh(refreshToken: string): Promise<TokenPair> {
  if (!refreshPromise) {
    refreshPromise = rawHttp
      .post<ApiResponse<TokenPair>>('/user/refresh', { refreshToken })
      .then((res) => {
        const body = res.data
        // 刷新失败在业务上以 code = 401 返回（§0.5）
        if (body.code !== 0 || !body.data) {
          throw new Error(body.msg || '登录已过期，请重新登录')
        }
        authBridge?.setTokens(body.data)
        return body.data
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

/** 认证类接口：不参与 401 刷新重放 */
const AUTH_PATH = /\/user\/(login|refresh|register|reset-password|verify)/

http.interceptors.response.use(
  (response) => {
    // 二进制流（下载 / 图片预览）不做 JSON 解包（§6.4）
    if (response.config.responseType === 'blob') {
      return response.data
    }
    const body = response.data as ApiResponse
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        return body
      }
      // 业务失败（HTTP 多为 200）：code !== 0，展示后端 msg（§0.2）
      const rid = response.config.requestId
      const msg = body.msg || '请求失败'
      return Promise.reject(new Error(rid ? `${msg}（请求 ID：${rid}）` : msg))
    }
    return body
  },
  async (error: AxiosError<ApiResponse>) => {
    const config = error.config
    const status = error.response?.status
    const url = config?.url ?? ''

    // HTTP 401 → 刷新流程（§0.5）；认证类接口显式标记跳过，避免自刷新死循环
    if (
      status === 401 &&
      config &&
      !config._retried &&
      !config._skipAuthRefresh &&
      !AUTH_PATH.test(url)
    ) {
      const refreshToken = authBridge?.getRefreshToken()
      if (refreshToken) {
        try {
          const tokens = await performRefresh(refreshToken)
          // 只重放一次（§0.5 要点 2）
          config._retried = true
          config.headers.Authorization = `Bearer ${tokens.accessToken}`
          return http.request(config)
        } catch {
          // 刷新失败 → 清空凭证并跳登录页
        }
      }
      authBridge?.clearAuth()
      redirectToLogin?.()
    }

    return Promise.reject(new Error(composeErrorMessage(error)))
  },
)

export default http
