import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
// 全局纸面底色与基础排版，仅在此引入一次
import '@/styles/global.scss'

const app = createApp(App).use(router)

// 仅开发环境且开启开关时装载 Mock 适配器（预览视觉用；动态导入确保不进生产包）
if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === '1') {
  const { installMockAdapter } = await import('@/api/mock')
  installMockAdapter()
}

app.mount('#app')
