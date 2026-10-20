import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 后端 Base URL: https://documenter.perfumestore.xin，通过 dev 代理转发，避免跨域
export default defineConfig({
  // GitHub Pages 的项目站点部署在 /docu_frontend/ 子路径下，必须与仓库名一致。
  // 不设这一项时 base 默认为 '/'，构建产物里的资源引用会写成 /assets/*.js，
  // 浏览器会去域名根目录找（jenandygyt-web.github.io/assets/...）而实际文件在
  // /docu_frontend/assets/... → 404 → #app 为空 → 白屏。
  base: '/docu_frontend/',
  plugins: [
    // Modern browser targets use WOFF2; omit legacy fallback copies from fontsource CSS.
    { name: 'woff2-fonts', enforce: 'pre', transform(code, id) {
      if (id.includes('/@fontsource/') && id.endsWith('.css')) {
        return code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, '')
      }
    } },
    vue(),
  ],
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
        api: 'modern',
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
      '/user': { target: 'https://documenter.perfumestore.xin', changeOrigin: true },
      '/admin': { target: 'https://documenter.perfumestore.xin', changeOrigin: true },
      '/file': { target: 'https://documenter.perfumestore.xin', changeOrigin: true },
      '/template': { target: 'https://documenter.perfumestore.xin', changeOrigin: true },
      '/task': { target: 'https://documenter.perfumestore.xin', changeOrigin: true },
      '/docx': { target: 'https://documenter.perfumestore.xin', changeOrigin: true },
      // AI 会话与智能编辑接口（后端 /ai/**）。原代理列表遗漏了这一段，
      // 本地开发时 /ai 请求不会被转发，会落到 vite 自身而 404。
      '/ai': { target: 'https://documenter.perfumestore.xin', changeOrigin: true },
    },
  },
})
