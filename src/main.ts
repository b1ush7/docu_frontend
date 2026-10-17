/**
 * @file 应用入口
 * @description 创建并挂载 Vue 应用：注册 Pinia 与 Vue Router，引入思源宋体与全局样式。
 *              用户端（登录/注册/工作台）为手写组件，贴合「克制 / 清透」的纸面设计气质；
 *              管理端（/admin/**）基于 Element Plus，两者共存。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'

// 思源宋体（Noto Serif SC）：400 正文 / 500 标题品牌名 / 600 极少数强调
// 次要说明仍用 400，靠颜色变浅区分，不使用更细字重
import '@fontsource/noto-serif-sc/400.css'
import '@fontsource/noto-serif-sc/500.css'
import '@fontsource/noto-serif-sc/600.css'

// 思源黑体（Noto Sans SC）：与宋体同字重，供 variables.scss 切换预览时使用
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/600.css'

import App from './App.vue'
import router from './router'

// 管理端（/admin/**）基于 Element Plus；登录注册页为手写组件，两者共存
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './styles/global.scss'
import './style.css'
import { watchTokenCleared } from './utils/token'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

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
