/**
 * @file 路由配置
 * @description /login、/register、/reset-password 与 / 四个路由；全局前置守卫基于 localStorage 中的
 *              登录凭证做最外层拦截（避免在模块加载期引入 Pinia 循环依赖）：
 *              · 未登录访问需认证页面 → 重定向 /login；
 *              · 已登录访问 /login、/register 或 /reset-password → 重定向 /。
 */
import { createRouter, createWebHistory } from 'vue-router'

/** 无需登录即可访问的页面路径（已登录用户访问时统一回首页） */
const GUEST_PATHS = ['/login', '/register', '/reset-password']

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/reset-password',
      name: 'ResetPassword',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      name: 'Home',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

/** 本地是否已存有登录凭证（与 stores/user.ts 的 STORAGE_KEY 对应） */
function hasStoredAuth(): boolean {
  try {
    const raw = localStorage.getItem('wenshu.auth')
    if (!raw) {
      return false
    }
    const data = JSON.parse(raw) as { tokens?: { accessToken?: string } }
    return Boolean(data.tokens?.accessToken)
  } catch {
    return false
  }
}

router.beforeEach((to) => {
  const authed = hasStoredAuth()
  if (to.meta.requiresAuth !== false && !authed) {
    return { path: '/login' }
  }
  if (GUEST_PATHS.includes(to.path) && authed) {
    return { path: '/' }
  }
  return true
})

export default router
