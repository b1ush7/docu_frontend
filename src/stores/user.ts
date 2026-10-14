/**
 * @file stores/user.ts
 * @description 用户认证状态（Pinia setup 语法），对齐《前端联调文档》§一 / §0.5。
 *
 *              职责：
 *              · 持有 TokenPair 与当前用户信息，持久化到 localStorage；
 *              · 密码 / 验证码两种登录（请求字段与路径见 api/auth.ts）；
 *              · 向 http.ts 注入 AuthBridge，支撑请求自动携带 Token、
 *                401 自动刷新与失效清空；
 *              · 跨标签页同步：监听 storage 事件，避免多标签各持一份 Token
 *                互相覆盖（§0.5 要点 4）。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  getCurrentUser,
  loginByCode,
  loginByPassword,
  logout as apiLogout,
  logoutAll as apiLogoutAll,
} from '@/api/auth'
import { bindAuth } from '@/api/http'
import type { TokenPair, UserInfo } from '@/types/user'

const STORAGE_KEY = 'wenshu.auth'

/** localStorage 持久化结构 */
interface PersistedAuth {
  tokens: TokenPair
  user: UserInfo | null
}

function readPersisted(): PersistedAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PersistedAuth) : null
  } catch {
    return null
  }
}

export const useUserStore = defineStore('user', () => {
  const persisted = readPersisted()

  /// 登录凭证（access 15 分钟 / refresh 7 天）
  const tokens = ref<TokenPair | null>(persisted?.tokens ?? null)
  /// 当前登录用户信息
  const user = ref<UserInfo | null>(persisted?.user ?? null)

  const isLoggedIn = computed(() => tokens.value !== null)
  const accessToken = computed(() => tokens.value?.accessToken ?? null)

  /** 持久化当前状态 */
  function persist(): void {
    if (tokens.value) {
      const data: PersistedAuth = { tokens: tokens.value, user: user.value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  /** 清空登录凭证（供 http 层 401 失效回调复用） */
  function clearAuth(): void {
    tokens.value = null
    user.value = null
    persist()
  }

  /** 覆盖本地双 Token（供 http 层刷新成功后写回） */
  function setTokens(next: TokenPair): void {
    tokens.value = next
    persist()
  }

  /** 登录成功后写入凭证并拉取用户信息 */
  async function applyLogin(result: TokenPair): Promise<void> {
    setTokens(result)
    try {
      const res = await getCurrentUser()
      user.value = res.data
      persist()
    } catch {
      // 用户信息拉取失败不阻断登录，保持 user 为 null 后续再补
    }
  }

  /**
   * 账号密码登录
   * @param account  用户名或手机号
   * @param password 密码
   */
  async function loginWithPassword(account: string, password: string): Promise<void> {
    const res = await loginByPassword({ account, password })
    await applyLogin(res.data)
  }

  /**
   * 验证码登录
   * @param phone 手机号
   * @param code  短信验证码
   */
  async function loginWithCode(phone: string, code: string): Promise<void> {
    const res = await loginByCode({ phone, code })
    await applyLogin(res.data)
  }

  /** 退出当前设备：先请求后端撤销会话，再清空本地 */
  async function logout(): Promise<void> {
    try {
      await apiLogout()
    } catch {
      // 网络异常也要保证本地登出，避免残留凭证
    }
    clearAuth()
  }

  /**
   * 退出全部其他设备（当前设备保留登录）
   * @returns 实际撤销的会话数量
   */
  async function logoutAll(): Promise<number> {
    const res = await apiLogoutAll()
    return res.data
  }

  // 向 http 层注入 Token 读写能力，支撑自动携带与 401 刷新（§0.5）
  bindAuth({
    getAccessToken: () => tokens.value?.accessToken ?? null,
    getRefreshToken: () => tokens.value?.refreshToken ?? null,
    setTokens,
    clearAuth,
  })

  // 跨标签页同步：任一标签更新凭证，其余标签即时跟随（§0.5 要点 4）
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) {
      return
    }
    const next = readPersisted()
    tokens.value = next?.tokens ?? null
    user.value = next?.user ?? null
  })

  return {
    tokens,
    user,
    isLoggedIn,
    accessToken,
    loginWithPassword,
    loginWithCode,
    logout,
    logoutAll,
    clearAuth,
  }
})
