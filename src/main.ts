/**
 * @file 应用入口
 * @description 创建并挂载 Vue 应用：注册 Pinia 与 Vue Router，引入思源宋体与全局样式。
 *              本次设计不引入任何 UI 组件库，输入框 / 按钮 / Tab 全部手写，
 *              以贴合「克制 / 清透」的纸面设计气质。
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
import { setUnauthorizedHandler } from './api/http'
import './styles/global.scss'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 401 时清空本地凭证并跳转登录页（在 router 挂载后注入，避免循环依赖）
setUnauthorizedHandler(() => {
  void router.push('/login')
})

app.mount('#app')
