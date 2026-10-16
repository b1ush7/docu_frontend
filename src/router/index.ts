/**
 * @file 路由配置
 * @description 应用路由表与全局鉴权守卫：
 *              - 未登录访问受保护页面时重定向到登录页，并记录回跳地址；
 *              - 注册 401 兜底回调：请求层 Token 刷新失败时跳转登录页。
 */

import { createRouter, createWebHistory } from 'vue-router'
import { setUnauthorizedHandler } from '@/api/http'
import { getAccessToken } from '@/utils/token'

// 扩展路由 meta 类型，声明 requiresAuth 的业务含义
declare module 'vue-router' {
  interface RouteMeta {
    /** 该页面是否需要登录后才能访问 */
    requiresAuth?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      // 登录后的用户主工作台
      path: '/',
      name: 'workspace',
      component: () => import('@/views/WorkspaceView.vue'),
      meta: { requiresAuth: true },
    },
    {
      // 登录页（当前为占位页，登录功能另行实现）
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false },
    },
  ],
})

// 全局守卫：无 accessToken 时拦截受保护页面，携带回跳地址进入登录页
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !getAccessToken()) {
    // 开发环境放行：登录页尚未实现，便于本地预览工作台组件；
    // 生产构建不受影响，且接口返回 401 时请求层仍会跳回登录页。
    if (import.meta.env.DEV) {
      return true
    }
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})

// 请求层 401 兜底：Token 刷新失败时清空凭据并跳转登录页
setUnauthorizedHandler(() => {
  const current = router.currentRoute.value
  // 已在登录页则不重复跳转，避免路由抖动
  if (current.path !== '/login') {
    router.push({ path: '/login', query: { redirect: current.fullPath } })
  }
})

export default router
