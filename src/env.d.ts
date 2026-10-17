/// <reference types="vite/client" />

/**
 * 扩展 ImportMetaEnv，为环境变量提供类型提示。
 * 新增环境变量时需在此补充对应字段类型。
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
