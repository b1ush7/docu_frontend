/**
 * @file HTTP 请求基础层
 * @description 基于 axios 封装，职责：
 *              1. 请求头自动附加 Authorization: Bearer accessToken 与 X-Request-ID；
 *              2. 解析统一 JSON 响应（code=0 为成功，不能只看 HTTP 状态码）；
 *              3. 401 时用 refreshToken 单飞刷新并重放原请求，刷新失败清空凭据并触发跳转登录；
 *              4. 403 / 404 / 429 / 500 等错误统一转成友好提示（ApiError）。
 *              文件下载等二进制响应（responseType=blob）不做包装解析，直接透传完整响应。
 */

import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { API_ENDPOINTS } from './endpoints'
import type { ApiEnvelope, TokenPair } from './types'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/utils/token'

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

/** 请求配置扩展：标记重放请求，防止 401 后无限刷新循环 */
type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

/** 后端服务地址，可通过环境变量 VITE_API_BASE_URL 覆盖 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

// axios 实例：导出仅供开发态 Mock 适配器安装使用，业务代码请使用下方 getData/postData 等封装
export const http = axios.create({
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

/** 401 最终失败（刷新也失败）时由路由层注册的跳转回调 */
let unauthorizedHandler: (() => void) | null = null

/**
 * 注册 401 兜底回调（由路由模块调用，避免本模块反向依赖 router 造成循环引用）
 * @param handler 回调函数，通常执行 router.push('/login')；传 null 可注销
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

/**
 * 生成请求追踪 ID：32 位十六进制，满足后端 8～64 位 X-Request-ID 校验
 * @returns 追踪 ID 字符串
 */
function createRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

// ---------- 请求拦截：附加鉴权头与追踪头 ----------
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

// ---------- Token 刷新（单飞）：并发多个 401 只发起一次刷新 ----------
/** 进行中的刷新 Promise；null 表示当前没有刷新请求 */
let refreshingPromise: Promise<boolean> | null = null

/**
 * 用 refreshToken 调用刷新接口换取新 Token 对
 * 使用独立的 axios 调用直连后端，不经过本文件拦截器，避免递归刷新。
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

/**
 * 获取（或复用进行中的）刷新 Promise，保证并发多个 401 只触发一次刷新
 * @returns 刷新是否成功
 */
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
 * 401 统一处理：尝试刷新 Token，成功则重放原请求，失败则清空凭据并跳转登录
 * @param config 原请求配置
 * @returns 重放请求的响应（data 已替换为解包后的业务数据）
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
 * @param code 后端业务码或 HTTP 状态码
 * @param serverMsg 后端返回的错误信息
 * @returns 面向用户的提示文案
 */
function resolveErrorMessage(code: number, serverMsg?: string): string {
  if (serverMsg) {
    return serverMsg
  }
  return FALLBACK_MESSAGES[code] ?? `请求失败（${code}）`
}

// ---------- 响应拦截：解包统一响应 / 处理 401 / 归一化错误 ----------
// 按 axios 约定拦截器仍返回 AxiosResponse，仅把 data 替换为解包后的业务数据；
// 真正取出 data 由下方 getData / postData 等类型化方法完成。
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

// ---------- 对外导出的类型化请求方法 ----------
// 拦截器已把统一包装解包进 response.data，因此这里统一取出 data 返回；
// axios 1.x 对泛型 R 的条件类型在 T 为泛型参数时无法自动收敛，需显式收窄为 AxiosResponse<T>。

/**
 * 发起 GET 请求并返回解包后的业务数据
 * @param url 接口地址
 * @param config 额外 axios 配置（params 等）
 * @returns 业务数据
 */
export async function getData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const resp = (await http.get<T, T>(url, config)) as unknown as AxiosResponse<T>
  return resp.data
}

/**
 * 发起 POST 请求并返回解包后的业务数据
 * @param url 接口地址
 * @param data 请求体
 * @param config 额外 axios 配置
 * @returns 业务数据
 */
export async function postData<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const resp = (await http.post<T, T>(url, data, config)) as unknown as AxiosResponse<T>
  return resp.data
}

/**
 * 发起 PUT 请求并返回解包后的业务数据
 * @param url 接口地址
 * @param data 请求体
 * @param config 额外 axios 配置
 * @returns 业务数据
 */
export async function putData<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const resp = (await http.put<T, T>(url, data, config)) as unknown as AxiosResponse<T>
  return resp.data
}

/**
 * 发起 DELETE 请求并返回解包后的业务数据
 * @param url 接口地址
 * @param config 额外 axios 配置
 * @returns 业务数据（软删除接口通常为 null）
 */
export async function deleteData<T = null>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const resp = (await http.delete<T, T>(url, config)) as unknown as AxiosResponse<T>
  return resp.data
}

/**
 * 下载二进制文件（下载接口直接返回文件流，不走统一 JSON 包装）
 * @param url 接口地址
 * @returns 文件 Blob
 */
export async function getBlob(url: string): Promise<Blob> {
  // blob 响应在拦截器中透传完整响应，泛型 R 直接声明为 AxiosResponse<Blob>
  const resp = await http.get<Blob, AxiosResponse<Blob>>(url, { responseType: 'blob' })
  return resp.data
}
