import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 后端 Base URL: http://<host>:8080，通过 dev 代理转发，避免跨域
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/user': { target: 'http://localhost:8080', changeOrigin: true },
      '/admin': { target: 'http://localhost:8080', changeOrigin: true },
      '/file': { target: 'http://localhost:8080', changeOrigin: true },
      '/template': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
})
