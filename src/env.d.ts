/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // Vue 单文件组件默认导出的类型占位声明
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  /** 后端 API 服务地址，默认 http://localhost:8080 */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
