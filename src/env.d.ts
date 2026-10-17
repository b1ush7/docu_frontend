/// <reference types="vite/client" />

/**
 * 扩展 ImportMetaEnv，为环境变量提供类型提示。
 * 新增环境变量时需在此补充对应字段类型。
 */
interface ImportMetaEnv {
  /** 后端 API 服务地址，默认 http://localhost:8080 */
  readonly VITE_API_BASE_URL?: string
  /** 置为 '1' 时在开发环境装载 Mock 适配器（工作台视觉预览用） */
  readonly VITE_USE_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // Vue 单文件组件默认导出的类型占位声明
  const component: DefineComponent<object, object, unknown>
  export default component
}
