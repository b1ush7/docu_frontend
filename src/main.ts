import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-loading.css'
import 'element-plus/theme-chalk/el-badge.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-progress.css'
import 'element-plus/theme-chalk/el-notification.css'
/**
 * @file 应用入口
 * @description 创建并挂载 Vue 应用：注册 Pinia 与 Vue Router，引入思源宋体与全局样式。
 *              用户端（登录/注册/工作台）为手写组件，贴合「克制 / 清透」的纸面设计气质；
 *              管理端（/admin/**）基于 Element Plus，两者共存。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Preserve Unicode subsetting; headings use synthesized weight instead of loading four extra font sets.
import '@fontsource/noto-serif-sc/400.css'
import '@fontsource/noto-sans-sc/400.css'

import App from './App.vue'
import router from './router'

// 管理端（/admin/**）基于 Element Plus；登录注册页为手写组件，两者共存
import { ElLoading } from 'element-plus'
import './styles/global.scss'
import './style.css'
import { watchTokenCleared } from './utils/token'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.directive('loading', ElLoading.directive)

// 跨标签页同步：其他标签页退出登录后，本页跳登录（401 兜底由 router 注册）
watchTokenCleared(() => {
  if (router.currentRoute.value.path !== '/login') router.push('/login')
})

app.mount('#app')

// 仅开发环境且开启开关时装载 Mock 适配器（工作台视觉预览用；动态导入确保不进生产包）
if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === '1') {
  const { installMockAdapter } = await import('@/api/mock')
  installMockAdapter()
}
