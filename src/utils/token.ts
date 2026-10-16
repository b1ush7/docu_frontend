/**
 * @file Token 存取工具
 * @description 双 Token（accessToken / refreshToken）的本地持久化与读取。
 *              统一存放在 localStorage，key 加前缀避免与其他应用冲突。
 *              Token 过期后的刷新与跳转逻辑见 api/http.ts。
 */

/** accessToken 在 localStorage 中的存储键 */
const ACCESS_TOKEN_KEY = 'documenter:accessToken'
/** refreshToken 在 localStorage 中的存储键 */
const REFRESH_TOKEN_KEY = 'documenter:refreshToken'

/**
 * 读取本地保存的 accessToken
 * @returns accessToken；未登录时返回 null
 */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

/**
 * 读取本地保存的 refreshToken
 * @returns refreshToken；不存在时返回 null
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

/**
 * 登录或刷新成功后保存一对新 Token
 * @param accessToken 访问令牌（有效期 15 分钟）
 * @param refreshToken 刷新令牌（有效期 7 天，刷新成功后旧令牌立即失效）
 */
export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

/** 清空本地 Token，用于登出或刷新失败后的凭据重置 */
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}
