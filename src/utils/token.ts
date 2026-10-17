/**
 * @file Token 存取工具（双栈统一）
 * @description 全站唯一的 Token 持久化层，与 stores/user.ts 共用 'wenshu.auth'
 *              持久化结构：{ tokens: TokenPair, user: UserInfo | null }。
 *              旧版分离键（documenter:accessToken）已废弃，统一收敛到单一键。
 *              Token 过期后的刷新与跳转逻辑见 api/http.ts。
 */

/** 持久化存储键（与 stores/user.ts 保持一致） */
const STORAGE_KEY = 'wenshu.auth'

/** 本地保存的双 Token 结构 */
interface StoredTokens {
  accessToken: string
  refreshToken: string
  /** accessToken 剩余有效秒数（旧版写入，可能缺省） */
  expiresIn?: number
  /** refreshToken 剩余有效秒数（旧版写入，可能缺省） */
  refreshExpiresIn?: number
}

/** 'wenshu.auth' 持久化结构 */
interface StoredAuth {
  tokens?: StoredTokens
  user?: unknown
}

/** 读取本地持久化结构；损坏时返回 null */
function read(): StoredAuth | null {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as StoredAuth | null) ?? null
  } catch {
    return null
  }
}

/**
 * 读取本地保存的 accessToken
 * @returns accessToken；未登录时返回 null
 */
export function getAccessToken(): string | null {
  return read()?.tokens?.accessToken ?? null
}

/**
 * 读取本地保存的 refreshToken
 * @returns refreshToken；不存在时返回 null
 */
export function getRefreshToken(): string | null {
  return read()?.tokens?.refreshToken ?? null
}

/**
 * 登录 / 刷新成功后保存 Token。兼容两种调用形态：
 *  · setTokens(accessToken, refreshToken)：双字符串形态（api/http.ts typed 栈使用）；
 *  · setTokens(pair)：完整 TokenPair 对象形态（stores/user.ts / legacy 栈使用，
 *    可携带 expiresIn / refreshExpiresIn）。
 * 均保留已持久化的 user 信息不覆盖。
 */
export function setTokens(a: string | StoredTokens, b?: string): void {
  const current: StoredAuth = read() ?? { user: null }
  if (typeof a === 'string' && b !== undefined) {
    current.tokens = { accessToken: a, refreshToken: b }
  } else if (a && typeof a === 'object') {
    current.tokens = a
  } else {
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
}

/** 清空本地 Token 与用户信息，用于登出或刷新失败后的凭据重置 */
export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * 跨标签页同步：其他标签页清除凭证时，本页执行回调（跳转登录页）
 * @param onCleared 回调函数
 */
export function watchTokenCleared(onCleared: () => void): void {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && !e.newValue) onCleared()
  })
}
