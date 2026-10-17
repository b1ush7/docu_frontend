import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './style.css'
import App from './App.vue'
import router from './router'
import { watchTokenCleared } from './utils/token'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')

// 跨标签页同步：其他标签页退出登录后，本页跳登录
watchTokenCleared(() => {
  if (router.currentRoute.value.path !== '/login') router.push('/login')
})
