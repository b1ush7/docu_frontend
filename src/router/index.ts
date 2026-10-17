/**
 * @file 路由配置（合并 feature-login 认证页与管理端后台）
 * @description
 *  · 认证页：/login、/register、/reset-password、/change-password（来自 feature-login，手写组件）；
 *  · 普通用户首页：/（HomeView 占位页）；
 *  · 管理端：/admin/**（AdminLayout + 概览/用户/文件/任务，Element Plus）。
 * 全局前置守卫基于 stores/user.ts 的登录凭证做最外层拦截：
 *  · 未登录访问需认证页面 → 重定向 /login（带 redirect 参数）；
 *  · 已登录访问 /login、/register、/reset-password → 重定向 /；
 *  · /admin/** 额外要求 ADMIN 角色，用户信息缺失时补拉 /user/me。
 */
import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'

import { getCurrentUser } from '@/api/auth'
import { PREVIEW_MODE, PREVIEW_USER } from '@/utils/preview'
import type { UserInfo } from '@/types/user'
import { useUserStore } from '@/stores/user'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    adminOnly?: boolean
  }
}

/** 无需登录即可访问的页面路径（已登录用户访问时统一回首页） */
const GUEST_PATHS = ['/login', '/register', '/reset-password']

const router = createRouter({
  history: createWebHistory(),
  routes: [
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
      path: '/',
      name: 'Home',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true, title: '首页' },
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

router.beforeEach(async (to) => {
  document.title = to.meta.title ? `${to.meta.title} · 文枢` : '文枢'

  // 【临时】预览模式：注入假管理员身份并放行所有页面，允许查看登录页本身，联调前删除
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
