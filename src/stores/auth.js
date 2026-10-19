import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from './user'

// Both user and management pages observe the same identity and token lifecycle.
export const useAuthStore = defineStore('auth', () => {
  const account = useUserStore()
  const user = computed(() => account.user)
  const isLoggedIn = computed(() => account.isLoggedIn)
  const isAdmin = computed(() => account.user?.role === 'ADMIN')
  async function login(username, password) {
    await account.loginWithPassword(username, password)
    if (!account.user) await account.fetchMe()
    if (account.user?.role !== 'ADMIN') {
      account.clearAuth()
      const error = new Error('当前账号无管理员权限')
      error.code = 403
      throw error
    }
  }
  return {
    user, isLoggedIn, isAdmin, login,
    fetchMe: account.fetchMe,
    logout: account.logout,
    logoutAll: account.logoutAll,
    clearLocal: account.clearAuth,
  }
})
