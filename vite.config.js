import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 后端 Base URL: http://<host>:8080，通过 dev 代理转发，避免跨域
export default defineConfig({
  plugins: [vue()],
  resolve: {
    // 统一使用 @ 指向 src 目录，避免组件内出现多层相对路径
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 向所有 scss 样式块自动注入设计变量模块，
        // 组件内可直接使用 $ink / $paper-base 等变量，无需重复 @use
        additionalData: '@use "@/styles/variables.scss" as *;',
        api: 'modern-compiler',
      },
    },
  },
  define: {
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  server: {
    proxy: {
      '/user': { target: 'http://localhost:8080', changeOrigin: true },
      '/admin': { target: 'http://localhost:8080', changeOrigin: true },
      '/file': { target: 'http://localhost:8080', changeOrigin: true },
      '/template': { target: 'http://localhost:8080', changeOrigin: true },
      '/task': { target: 'http://localhost:8080', changeOrigin: true },
      '/docx': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
})
