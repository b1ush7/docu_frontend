import { defineStore } from 'pinia'
import * as authApi from '../api/auth'
import { setTokens, clearTokens, getAccessToken } from '../utils/token'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null, // { id, username, role, ... }
  }),
  getters: {
    isLoggedIn: () => !!getAccessToken(),
    isAdmin: (state) => state.user?.role === 'ADMIN',
  },
  actions: {
    // 登录并校验管理员角色；非 ADMIN 抛错并清凭证
    async login(account, password) {
      const res = await authApi.login({ account, password }, { silent: true })
      setTokens(res.data)
      try {
        await this.fetchMe({ silent: true })
      } catch (e) {
        clearTokens()
        throw e
      }
      if (this.user?.role !== 'ADMIN') {
        clearTokens()
        this.user = null
        const err = new Error('当前账号无管理员权限')
        err.code = 403
        throw err
      }
    },
    async fetchMe(config = {}) {
      const res = await authApi.fetchMe(config)
      this.user = res.data
      return this.user
    },
    async logout() {
      try {
        await authApi.logout()
      } finally {
        this.clearLocal()
      }
    },
    // 退出全部其他设备，返回撤销会话数
    async logoutAll() {
      const res = await authApi.logoutAll()
      return res.data
    },
    clearLocal() {
      clearTokens()
      this.user = null
    },
  },
})
