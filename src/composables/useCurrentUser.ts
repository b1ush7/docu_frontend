/**
 * @file 当前用户信息复用逻辑
 * @description 以模块级单例状态持有当前登录用户（GET /user/me），整个会话只请求一次，
 *              供文件列表顶栏等需要展示用户身份的组件共用；后续 store 接入后可整体迁移。
 */
import { ref } from 'vue'
import { userApi } from '@/api/user'
import type { UserInfo } from '@/api/types'

// 模块级单例：所有调用 useCurrentUser() 的组件共享同一份状态，避免重复请求 /user/me
const user = ref<UserInfo | null>(null)
const loaded = ref(false)
const loading = ref(false)

/** 拉取失败提示（加载失败时顶栏头像位显示占位，不弹全局提示） */
const error = ref('')

/**
 * 获取当前用户信息（已加载过则直接复用，不重复请求）
 */
async function fetchUser(): Promise<void> {
  // 会话内已成功加载过则跳过；失败后允许重试
  if (loaded.value || loading.value) {
    return
  }
  loading.value = true
  try {
    user.value = await userApi.me()
    loaded.value = true
    error.value = ''
  } catch {
    // 401 等鉴权问题由 http 层统一处理跳转，这里仅静默降级为占位展示
    error.value = '用户信息获取失败'
  } finally {
    loading.value = false
  }
}

/**
 * 创建当前用户信息状态（模块级单例，多组件共享）
 * @returns 用户状态与首次加载触发方法
 */
export function useCurrentUser() {
  return { user, loading, error, fetchUser }
}
