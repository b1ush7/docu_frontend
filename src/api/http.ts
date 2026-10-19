/** Shared transport: raw Authorization token and one refresh flight across all clients. */
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import type { ApiEnvelope, TokenPair } from './types'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/utils/token'

export interface ApiResponse<T = unknown> { code: number; msg?: string; data: T }
declare module 'axios' {
  interface AxiosRequestConfig { _skipAuthRefresh?: boolean; silent?: boolean; _retried?: boolean; requestId?: string }
}
export class ApiError extends Error {
  constructor(readonly code: number, message: string, readonly requestId?: string) {
    super(message)
    this.name = 'ApiError'
  }
}
export interface AuthBridge {
  getAccessToken: () => string | null
  getRefreshToken: () => string | null
  setTokens: (tokens: TokenPair) => void
  clearAuth: () => void
}
let authBridge: AuthBridge | null = null
let unauthorizedHandler: (() => void) | null = null
export function bindAuth(bridge: AuthBridge): void { authBridge = bridge }
export function setUnauthorizedHandler(handler: (() => void) | null): void { unauthorizedHandler = handler }
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'https://documenter.perfumestore.xin').replace(/\/$/, '')
const AUTH_PATH = /\/user\/(?:login|refresh|register|reset-password)(?:\/|$)/
const FALLBACK: Record<number, string> = {
  400: '请求参数有误', 401: '登录已过期，请重新登录', 403: '权限不足，无法执行该操作',
  404: '资源不存在或已删除', 409: '当前状态已变化，请刷新后重试', 413: '文件超过大小限制',
  415: '文件类型不支持', 422: '文档内容损坏或暂不支持编辑', 429: '操作过于频繁，请稍后再试',
  500: '服务异常，请稍后重试', 502: '外部服务失败，请稍后重试', 503: '服务暂不可用，请稍后重试',
  [-1]: '网络异常或请求超时，请稍后重试',
}
const rawHttp = axios.create({ baseURL: BASE_URL, timeout: 30000 })
export const http = axios.create({ baseURL: BASE_URL, timeout: 30000 })
const httpLegacy = axios.create({ baseURL: BASE_URL, timeout: 30000 })
function expireAuth(): void {
  clearTokens()
  authBridge?.clearAuth()
  unauthorizedHandler?.()
}
let refreshPromise: Promise<TokenPair> | null = null
function refreshOnce(): Promise<TokenPair> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken()
      if (!refreshToken) throw new ApiError(401, FALLBACK[401]!)
      try {
        const response = await rawHttp.post<ApiResponse<TokenPair>>('/user/refresh', { refreshToken })
        const body = response.data
        if (body.code !== 0 || !body.data?.accessToken || !body.data?.refreshToken) {
          throw new ApiError(body.code || 401, body.msg || FALLBACK[401]!)
        }
        if (getRefreshToken() !== refreshToken) throw new ApiError(409, '登录状态已变化，请重新操作')
        setTokens(body.data)
        authBridge?.setTokens(body.data)
        return body.data
      } catch (error) {
        if (error instanceof ApiError) throw error
        if (axios.isAxiosError(error)) {
          const status = error.response?.status ?? -1
          throw new ApiError(status, error.response?.data?.msg || FALLBACK[status] || '刷新登录状态失败')
        }
        throw error
      }
    })().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}
async function replay(client: AxiosInstance, config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  if (config._retried) {
    expireAuth()
    throw new ApiError(401, FALLBACK[401]!)
  }
  config._retried = true
  const latest = getAccessToken()
  if (!latest || config.headers.get('Authorization') === latest) {
    try { await refreshOnce() }
    catch (error) {
      if (error instanceof ApiError && (error.code === 401 || error.code === 403)) expireAuth()
      throw error
    }
  }
  config.headers.set('Authorization', getAccessToken() ?? '')
  return client.request(config)
}
async function envelopeOf(data: unknown): Promise<Partial<ApiEnvelope<unknown>> | null> {
  if (data instanceof Blob) {
    if (!data.type.includes('json') || data.size > 1024 * 1024) return null
    try { return JSON.parse(await data.text()) } catch { return null }
  }
  return data !== null && typeof data === 'object' && 'code' in data
    ? data as Partial<ApiEnvelope<unknown>> : null
}
function configure(client: AxiosInstance, unwrap: boolean): void {
  client.interceptors.request.use((config) => {
    const token = getAccessToken()
    if (token) config.headers.set('Authorization', token)
    else config.headers.delete('Authorization')
    config.requestId = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
      ?? `req${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
    config.headers.set('X-Request-ID', config.requestId)
    return config
  })
  client.interceptors.response.use(async (response) => {
    const binary = response.config.responseType === 'blob'
    const body = binary && !(response.data instanceof Blob && response.data.type.includes('json'))
      ? null : await envelopeOf(response.data)
    if (body && body.code !== 0) {
      if (body.code === 401 && !response.config._skipAuthRefresh && !AUTH_PATH.test(response.config.url ?? '')) {
        return replay(client, response.config)
      }
      throw new ApiError(body.code ?? -1, body.msg || FALLBACK[body.code ?? -1] || '请求失败', response.config.requestId)
    }
    if (binary) return response
    if (unwrap) {
      if (body) response.data = body.data
      return response
    }
    return response.data
  }, async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error
    const status = error.response?.status ?? -1
    const body = await envelopeOf(error.response?.data)
    if (status === 401 && error.config && !error.config._skipAuthRefresh && !AUTH_PATH.test(error.config.url ?? '')) {
      return replay(client, error.config)
    }
    throw new ApiError(body?.code ?? status, body?.msg || FALLBACK[status] || '请求失败',
      error.response?.headers['x-request-id'] || error.config?.requestId)
  })
}
configure(http, true)
configure(httpLegacy, false)
export async function getData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return (await http.get<T>(url, config)).data
}
export async function postData<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return (await http.post<T>(url, data, config)).data
}
export async function putData<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return (await http.put<T>(url, data, config)).data
}
export async function deleteData<T = null>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return (await http.delete<T>(url, config)).data
}
export async function getBlob(url: string, config?: AxiosRequestConfig): Promise<Blob> {
  return (await http.get<Blob>(url, { ...config, responseType: 'blob' })).data
}
export default httpLegacy
