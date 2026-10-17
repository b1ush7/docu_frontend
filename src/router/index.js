import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getAccessToken } from '../utils/token'
import { useAuthStore } from '../stores/auth'
import { PREVIEW_MODE, PREVIEW_USER } from '../utils/preview'

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/LoginView.vue'), meta: { title: '登录' } },
  {
    path: '/admin',
    component: () => import('../layout/AdminLayout.vue'),
    children: [
      { path: '', name: 'Overview', component: () => import('../views/OverviewView.vue'), meta: { title: '概览统计' } },
      { path: 'users', name: 'Users', component: () => import('../views/UsersView.vue'), meta: { title: '用户管理' } },
      { path: 'files', name: 'Files', component: () => import('../views/FilesView.vue'), meta: { title: '文件管理' } },
      { path: 'tasks', name: 'Tasks', component: () => import('../views/TasksView.vue'), meta: { title: '任务管理' } },
      { path: 'model-configs', name: 'ModelConfigs', component: () => import('../views/ModelConfigsView.vue'), meta: { title: '模型配置' } },
      { path: 'templates', name: 'Templates', component: () => import('../views/TemplatesView.vue'), meta: { title: '模板管理' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/admin' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  document.title = to.meta?.title ? `${to.meta.title} · 文枢管理后台` : '文枢管理后台'
  // 【临时】预览模式：注入假管理员身份并放行所有页面，联调前删除
  if (PREVIEW_MODE) {
    const auth = useAuthStore()
    if (!auth.user) auth.user = PREVIEW_USER
    return to.path === '/login' ? '/admin' : true
  }
  const token = getAccessToken()
  if (to.path === '/login') {
    return token ? '/admin' : true
  }
  if (!token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  const auth = useAuthStore()
  if (!auth.user) {
    try {
      await auth.fetchMe({ silent: true })
    } catch {
      auth.clearLocal()
      return '/login'
    }
  }
  if (auth.user.role !== 'ADMIN') {
    ElMessage.error('当前账号无管理员权限')
    auth.clearLocal()
    return '/login'
  }
  return true
})

export default router
