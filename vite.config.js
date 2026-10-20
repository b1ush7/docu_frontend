import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

/**
 * 开发代理默认指向生产后端。
 * 本地联调时在 `.env.development.local`（已被 gitignore）里写：
 *   VITE_DEV_PROXY_TARGET=http://localhost:8080
 * 即可把请求转给本地 Spring Boot，无需改动本文件。
 */
const DEFAULT_BACKEND = 'https://documenter.perfumestore.xin'

/** 需要转发到后端的一级路径前缀（与 src/api/endpoints.ts 中的前缀一致） */
const PROXY_PREFIXES = ['/user', '/admin', '/file', '/template', '/task', '/docx', '/ai']

export default defineConfig(({ mode }) => {
  // loadEnv 第三个参数传 '' 表示不限定 VITE_ 前缀，这样自定义变量也能读到
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_DEV_PROXY_TARGET?.trim() || DEFAULT_BACKEND

  // 代理目标只保留一处定义：之前每个前缀各写一遍 URL，
  // 换后端地址时要改 7 行，容易漏掉某一段（历史上 /ai 就漏过一次）。
  const proxy = Object.fromEntries(
    PROXY_PREFIXES.map(prefix => [prefix, { target: backendTarget, changeOrigin: true }]),
  )

  return {
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
      // 本地联调时把 VITE_DEV_PROXY_TARGET 指向本地后端，日志里会打印实际目标
      proxy,
    },
  }
})
