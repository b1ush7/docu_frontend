/**
 * @file HTTP 请求基础层（双栈合并）
 * @description 同一文件承载两套请求栈，供不同功能域使用：
 *
 *  · 默认导出（legacy 栈）：来自 feature-login 的认证栈，供 api/auth.ts 与
 *    stores/user.ts 使用。响应拦截器**返回统一响应体外层（envelope）本身**，
 *    调用方按 `res.data` 取业务数据；认证类接口（/user/login 等）跳过 401
 *    刷新重放，保证「账号或密码错误」这类提示原样透出；404 统一话术
 *    "资源不存在或已删除"；Token 读写通过 bindAuth 桥接 user store。
 *
 *  · 命名导出 http（typed 栈）：供 api/user.ts、file.ts、task.ts、docx.ts 与
 *    mock.ts 使用。响应拦截器**把 envelope.data 解包进 response.data**，
 *    业务代码使用下方 getData/postData/putData/deleteData/getBlob 类型化方法；
 *    导出 http 实例仅供开发态 Mock 适配器安装使用。
 *
 *  两栈共享同一 Token 存储（utils/token.ts）与同一 401 兜底回调
 *  （setUnauthorizedHandler，由路由模块注册），刷新均为互斥单飞、只重放一次。
 */

import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { API_ENDPOINTS } from './endpoints'
import type { ApiEnvelope, TokenPair } from './types'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/utils/token'
import type { TokenPair as LegacyTokenPair } from '@/types/user'

/** 后端统一响应体结构（legacy 栈使用）：错误信息字段为 msg */
export interface ApiResponse<T = unknown> {
  code: number
  msg?: string
  data: T
}

/** 为 axios 配置附加自定义字段（重放标记、请求追踪 ID） */
declare module 'axios' {
  export interface InternalAxiosRequestConfig<D = unknown> {
    /** 已重放过一次，防止无限循环（legacy 栈） */
    _retried?: boolean
    /** 本次请求的追踪 ID，回显在错误提示中 */
    requestId?: string
    /** 认证类接口标记：不参与 401 刷新重放，避免自刷新死循环 */
    _skipAuthRefresh?: boolean
  }
}

/** 业务错误对象：code 为后端业务码（无法取得业务码时为 HTTP 状态码），message 为面向用户的提示 */
export class ApiError extends Error {
  /** 后端业务码或 HTTP 状态码 */
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** 请求配置扩展：标记重放请求，防止 401 后无限刷新循环（typed 栈） */
type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

/** 后端服务地址，可通过环境变量 VITE_API_BASE_URL 覆盖 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

// ==================== 认证桥接（legacy 栈） ====================

/** 认证桥接：由 user store 注入，http 模块借它读写 Token */
export interface AuthBridge {
  getAccessToken: () => string | null
  getRefreshToken: () => string | null
  setTokens: (tokens: LegacyTokenPair) => void
  clearAuth: () => void
}

let authBridge: AuthBridge | null = null

/** 由 stores/user.ts 注入 Token 存取能力 */
export function bindAuth(bridge: AuthBridge): void {
  authBridge = bridge
}

// ==================== 401 兜底回调（两栈共用） ====================

let unauthorizedHandler: (() => void) | null = null

/**
 * 注册 401 兜底回调（由路由模块调用，避免本模块反向依赖 router 造成循环引用）
 * @param handler 回调函数，通常执行 router.push('/login')；传 null 可注销
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

/** 生成请求追踪 ID：32 位十六进制，满足后端 8～64 位 X-Request-ID 校验 */
function createRequestId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    return `req${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  }
}

// ==================== typed 栈实例（命名导出） ====================

// axios 实例：导出仅供开发态 Mock 适配器安装使用，业务代码请使用下方 getData/postData 等封装
export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

// ==================== legacy 栈实例（默认导出） ====================

const httpLegacy: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

/** 仅用于刷新 Token 的裸实例：不挂拦截器，避免刷新请求自身触发 401 递归 */
const rawHttp: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

/** 常见错误的兜底提示；后端 msg 为空时使用 */
const FALLBACK_MESSAGES: Record<number, string> = {
  400: '请求参数有误',
  401: '登录已过期，请重新登录',
  403: '权限不足，无法执行该操作',
  404: '资源不存在或已被删除',
  409: '当前状态不允许该操作，请刷新后重试',
  413: '文件超过大小限制',
  415: '文件类型不支持',
  422: '文档内容损坏或暂不支持编辑',
  429: '操作过于频繁，请稍后再试',
  500: '服务器开小差了，请稍后重试',
  502: '验证码发送失败，请稍后重试',
  [-1]: '网络异常，请检查网络连接',
}

/** 401 刷新互斥（typed 栈）：并发多个 401 只发起一次刷新 */
let refreshingPromise: Promise<boolean> | null = null

/**
 * 用 refreshToken 调用刷新接口换取新 Token 对（typed 栈）
 * 使用独立的 axios 调用直连后端，不经过拦截器，避免递归刷新。
 * @returns 刷新是否成功
 */
async function requestRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  // 本地没有 refreshToken（未登录或已清空），直接判定失败
  if (!refreshToken) {
    return false
  }
  try {
    const resp = await axios.post<ApiEnvelope<TokenPair>>(
      `${BASE_URL}${API_ENDPOINTS.user.refresh}`,
      { refreshToken },
    )
    const envelope = resp.data
    // 刷新成功：覆盖本地双 Token（旧 refreshToken 已被服务端作废）
    if (envelope.code === 0 && envelope.data) {
      setTokens(envelope.data.accessToken, envelope.data.refreshToken)
      return true
    }
    clearTokens()
    return false
  } catch {
    // 刷新接口不可达或 refreshToken 已过期：清空凭据，要求重新登录
    clearTokens()
    return false
  }
}

/** 获取（或复用进行中的）刷新 Promise，保证并发多个 401 只触发一次刷新（typed 栈） */
function ensureRefreshed(): Promise<boolean> {
  if (!refreshingPromise) {
    refreshingPromise = requestRefresh().finally(() => {
      // 刷新结束后清空引用，下次 401 重新发起
      refreshingPromise = null
    })
  }
  return refreshingPromise
}

/**
 * 401 统一处理（typed 栈）：尝试刷新 Token，成功则重放原请求，失败则清空凭据并跳转登录
 * @throws ApiError 刷新失败时抛出 401 错误
 */
async function replayAfterRefresh(config: RetriableConfig): Promise<unknown> {
  const refreshed = await ensureRefreshed()
  if (!refreshed) {
    // 凭据已在刷新失败时清空，通知路由层跳转登录页
    unauthorizedHandler?.()
    throw new ApiError(401, FALLBACK_MESSAGES[401])
  }
  // 标记重放：此请求若再次 401 将直接进入失败分支，避免死循环
  config._retry = true
  config.headers.set('Authorization', `Bearer ${getAccessToken() ?? ''}`)
  return http.request(config)
}

/**
 * 归并错误提示：优先展示后端 msg（已脱敏），为空时回退到本地兜底文案
 */
function resolveErrorMessage(code: number, serverMsg?: string): string {
  if (serverMsg) {
    return serverMsg
  }
  return FALLBACK_MESSAGES[code] ?? `请求失败（${code}）`
}

// ---------- typed 栈拦截器 ----------

http.interceptors.request.use((config) => {
  const token = getAccessToken()
  // 已登录的请求统一携带 Bearer Token
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  // 传入请求追踪 ID，便于前后端日志对账
  config.headers.set('X-Request-ID', createRequestId())
  return config
})

// 响应拦截：解包统一响应 / 处理 401 / 归一化错误。
// 拦截器把统一包装解包进 response.data，真正取出 data 由 getData 等类型化方法完成。
http.interceptors.response.use(
  (response): AxiosResponse | Promise<AxiosResponse> => {
    // 二进制响应（文件下载）没有统一包装，透传完整响应给调用方
    if (response.config.responseType === 'blob') {
      return response
    }
    const envelope = response.data as ApiEnvelope<unknown>
    // 业务成功：剥掉外层包装，把 data 替换进响应体
    if (envelope.code === 0) {
      response.data = envelope.data
      return response
    }
    // 部分业务异常仍返回 HTTP 200，必须依据业务码判断：
    // 业务码 401 说明 Token 失效，尝试刷新后重放
    if (envelope.code === 401 && !(response.config as RetriableConfig)._retry) {
      return replayAfterRefresh(response.config as RetriableConfig) as Promise<AxiosResponse>
    }
    throw new ApiError(envelope.code, resolveErrorMessage(envelope.code, envelope.msg))
  },
  async (error: AxiosError): Promise<AxiosResponse> => {
    const config = error.config as RetriableConfig | undefined
    const status = error.response?.status
    // HTTP 401：认证过滤器直接拒绝请求，尝试刷新后重放
    if (status === 401 && config && !config._retry) {
      return replayAfterRefresh(config) as Promise<AxiosResponse>
    }
    // 无响应（断网、超时）时 status 为 undefined，用 -1 表示网络层错误
    const code = status ?? -1
    const serverMsg = (error.response?.data as ApiEnvelope<unknown> | undefined)?.msg
    throw new ApiError(
      code,
      resolveErrorMessage(code, serverMsg ?? (status ? undefined : error.message)),
    )
  },
)

// ---------- typed 栈类型化请求方法 ----------

/** 发起 GET 请求并返回解包后的业务数据 */
export async function getData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const resp = (await http.get<T, T>(url, config)) as unknown as AxiosResponse<T>
  return resp.data
}

/** 发起 POST 请求并返回解包后的业务数据 */
export async function postData<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const resp = (await http.post<T, T>(url, data, config)) as unknown as AxiosResponse<T>
  return resp.data
}

/** 发起 PUT 请求并返回解包后的业务数据 */
export async function putData<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const resp = (await http.put<T, T>(url, data, config)) as unknown as AxiosResponse<T>
  return resp.data
}

/** 发起 DELETE 请求并返回解包后的业务数据（软删除接口通常为 null） */
export async function deleteData<T = null>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const resp = (await http.delete<T, T>(url, config)) as unknown as AxiosResponse<T>
  return resp.data
}

/**
 * 下载二进制文件（下载接口直接返回文件流，不走统一 JSON 包装）
 * @returns 文件 Blob
 */
export async function getBlob(url: string): Promise<Blob> {
  const resp = await http.get<Blob, AxiosResponse<Blob>>(url, { responseType: 'blob' })
  return resp.data
}

// ---------- legacy 栈拦截器 ----------

httpLegacy.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authBridge?.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  config.requestId = createRequestId()
  config.headers['X-Request-ID'] = config.requestId
  return config
})

/** 组装错误文案（legacy 栈）：优先用后端 msg，404 强制统一话术，并回显请求 ID */
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

  // 404 一律不提示"无权限"，避免泄露资源真实存在
  if (status === 404 && base.includes('权限')) {
    base = '资源不存在或已删除'
  }

  const rid = error.config?.requestId
  return rid ? `${base}（请求 ID：${rid}）` : base
}

/** 刷新互斥（legacy 栈）：并发 401 只允许一个真正刷新，其余复用同一 Promise */
let refreshPromise: Promise<LegacyTokenPair> | null = null

/** 执行刷新：成功后写入本地双 Token 并返回新 TokenPair */
function performRefresh(refreshToken: string): Promise<LegacyTokenPair> {
  if (!refreshPromise) {
    refreshPromise = rawHttp
      .post<ApiResponse<LegacyTokenPair>>('/user/refresh', { refreshToken })
      .then((res) => {
        const body = res.data
        // 刷新失败在业务上以 code = 401 返回
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

httpLegacy.interceptors.response.use(
  (response) => {
    // 二进制流（下载 / 图片预览）不做 JSON 解包
    if (response.config.responseType === 'blob') {
      return response.data
    }
    const body = response.data as ApiResponse
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        return body
      }
      // 业务失败（HTTP 多为 200）：code !== 0，展示后端 msg
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

    // HTTP 401 → 刷新流程；认证类接口显式标记跳过，避免自刷新死循环
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
          // 只重放一次
          config._retried = true
          config.headers.Authorization = `Bearer ${tokens.accessToken}`
          return httpLegacy.request(config)
        } catch {
          // 刷新失败 → 清空凭证并跳登录页
        }
      }
      authBridge?.clearAuth()
      unauthorizedHandler?.()
    }

    return Promise.reject(new Error(composeErrorMessage(error)))
  },
)

export default httpLegacy
