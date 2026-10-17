/**
 * @file 路由配置
 * @description 应用路由表与全局鉴权守卫，承载三个功能域：
 *              - 用户端：/ 登录后的主工作台（WorkspaceView）；
 *              - 认证页：/login、/register、/reset-password、/change-password；
 *              - 管理端：/admin/**（AdminLayout + 概览/用户/文件/任务，要求 ADMIN 角色）。
 *              守卫职责：
 *              - 未登录访问受保护页面 → 重定向登录页并记录回跳地址；
 *              - 已登录访问认证页 → 回首页；
 *              - /admin/** 额外校验 ADMIN 角色，用户信息缺失时补拉 /user/me；
 *              - 注册 401 兜底回调：请求层 Token 刷新失败时跳转登录页。
 */
import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'

import { getCurrentUser } from '@/api/auth'
import { setUnauthorizedHandler } from '@/api/http'
import { PREVIEW_MODE, PREVIEW_USER } from '@/utils/preview'
import type { UserInfo } from '@/types/user'
import { useUserStore } from '@/stores/user'

// 扩展路由 meta 类型，声明鉴权相关的业务含义
declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题（浏览器标签） */
    title?: string
    /** 该页面是否需要登录后才能访问 */
    requiresAuth?: boolean
    /** 该页面是否仅管理员可访问 */
    adminOnly?: boolean
  }
}

/** 无需登录即可访问的页面路径（已登录用户访问时统一回首页） */
const GUEST_PATHS = ['/login', '/register', '/reset-password']

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      // 登录后的用户主工作台
      path: '/',
      name: 'workspace',
      component: () => import('@/views/WorkspaceView.vue'),
      meta: { requiresAuth: true, title: '工作台' },
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false, title: '登录' },
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { requiresAuth: false, title: '注册' },
    },
    {
      path: '/reset-password',
      name: 'ResetPassword',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { requiresAuth: false, title: '找回密码' },
    },
    {
      // 修改密码页：需登录；成功后服务端撤销全部会话，页面自行清 Token 跳登录
      path: '/change-password',
      name: 'ChangePassword',
      component: () => import('@/views/ChangePasswordView.vue'),
      meta: { requiresAuth: true, title: '修改密码' },
    },
    {
      // 管理端后台：要求 ADMIN 角色（守卫中校验）
      path: '/admin',
      component: () => import('@/layout/AdminLayout.vue'),
      meta: { requiresAuth: true, adminOnly: true },
      children: [
        { path: '', name: 'Overview', component: () => import('@/views/OverviewView.vue'), meta: { title: '概览统计' } },
        { path: 'users', name: 'Users', component: () => import('@/views/UsersView.vue'), meta: { title: '用户管理' } },
        { path: 'files', name: 'Files', component: () => import('@/views/FilesView.vue'), meta: { title: '文件管理' } },
        { path: 'tasks', name: 'Tasks', component: () => import('@/views/TasksView.vue'), meta: { title: '任务管理' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// 请求层 401 兜底：Token 刷新失败时清空凭据并跳转登录页
setUnauthorizedHandler(() => {
  const current = router.currentRoute.value
  // 已在登录页则不重复跳转，避免路由抖动
  if (current.path !== '/login') {
    router.push({ path: '/login', query: { redirect: current.fullPath } })
  }
})

router.beforeEach(async (to) => {
  document.title = to.meta.title ? `${to.meta.title} · 文枢` : '文枢'

  // 【临时】预览模式：注入假管理员身份并放行所有页面，联调前删除
  if (PREVIEW_MODE) {
    const userStore = useUserStore()
    if (!userStore.user) userStore.user = PREVIEW_USER as unknown as UserInfo
    return true
  }

  const userStore = useUserStore()

  // 未登录访问需认证页面 → 登录页
  if (to.meta.requiresAuth !== false && !userStore.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 已登录访问认证页 → 回首页
  if (GUEST_PATHS.includes(to.path) && userStore.isLoggedIn) {
    return { path: '/' }
  }

  // 管理端守卫：要求 ADMIN 角色；用户信息缺失时补拉 /user/me
  if (to.matched.some((r) => r.meta.adminOnly)) {
    if (!userStore.user) {
      try {
        const res = await getCurrentUser()
        userStore.user = res.data
      } catch {
        userStore.clearAuth()
        return { path: '/login', query: { redirect: to.fullPath } }
      }
    }
    if (userStore.user?.role !== 'ADMIN') {
      ElMessage.error('当前账号无管理员权限')
      return { path: '/' }
    }
  }

  return true
})

export default router
