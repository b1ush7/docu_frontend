/**
 * @file 文件上传交互复用逻辑
 * @description 封装"选择文件 → 大小预校验 → 调用上传接口（带进度）→ 错误提示"的完整流程，
 *              供 MainUploadPanel（主内容区上传）与 FileListPanel（列表内上传）复用，
 *              避免同一套上传逻辑重复实现、后续改一处漏一处。
 */
import { ref, useTemplateRef } from 'vue'
import { fileApi } from '@/api/file'
import { ApiError } from '@/api/http'
import type { FileAsset } from '@/api/types'

/** 模板中隐藏 file input 的 ref 名：使用本组合函数的组件模板须有 <input ref="file-upload-input"> */
const FILE_INPUT_REF_KEY = 'file-upload-input'

/** useFileUpload 配置项 */
interface UseFileUploadOptions {
  /** 上传成功回调：携带服务端返回的新文件资产 */
  onUploaded: (file: FileAsset) => void
}

/** 客户端预校验的文件大小上限 50MB：与后端限制一致，提前拦截避免整包上传后被 413 拒绝 */
const MAX_FILE_SIZE = 50 * 1024 * 1024

/** 允许选择的文件扩展名，与后端支持格式一致（服务端仍按实际内容二次识别） */
const ACCEPT_TYPES = '.docx,.xlsx,.pdf,.png,.jpeg,.jpg,.gif,.bmp'

/**
 * 创建一份文件上传交互状态
 * @param options 上传成功回调配置
 * @returns 上传状态（进度 / 错误）与触发方法；ACCEPT_TYPES 供模板绑定 accept 属性
 */
export function useFileUpload(options: UseFileUploadOptions) {
  // 通过 useTemplateRef 绑定组件模板中的隐藏 file input，组合函数内部即可触发点击
  const fileInputRef = useTemplateRef<HTMLInputElement>(FILE_INPUT_REF_KEY)

  /** 是否正在上传：控制按钮禁用与进度条展示 */
  const uploading = ref(false)

  /** 上传进度百分比（0～100） */
  const progress = ref(0)

  /** 上传错误提示（控件正下方内联展示，不用弹窗） */
  const error = ref('')

  /**
   * 触发文件选择：点击隐藏的 file input
   */
  function triggerFileSelect(): void {
    // 进入新一轮选择前清空上次的错误提示
    error.value = ''
    fileInputRef.value?.click()
  }

  /**
   * 处理文件选择变化：取出 File 对象并执行上传
   * @param event 文件选择框 change 事件
   */
  function onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) {
      void handleUpload(file)
    }
    // 重置 input 值：保证同一文件重复选择时 change 事件仍能触发
    input.value = ''
  }

  /**
   * 执行文件上传：大小预校验 → 调用上传接口（带进度回调）→ 抛出成功回调
   * @param file 用户选择的文件对象
   */
  async function handleUpload(file: File): Promise<void> {
    // 大小预校验：超过后端限制时直接提示，省一次无效上传
    if (file.size > MAX_FILE_SIZE) {
      error.value = '文件超过 50MB 大小限制'
      return
    }
    uploading.value = true
    progress.value = 0
    try {
      // 调用上传接口（multipart/form-data），进度回调驱动进度条
      const asset = await fileApi.upload(file, (percent) => {
        progress.value = percent
      })
      // 上传成功：清空错误并通知调用方
      error.value = ''
      options.onUploaded(asset)
    } catch (e) {
      // ApiError 的 message 已是面向用户的友好提示（401 刷新 / 413 / 415 等），直接展示
      error.value = e instanceof ApiError ? e.message : '上传失败，请稍后重试'
    } finally {
      uploading.value = false
    }
  }

  return {
    uploading,
    progress,
    error,
    ACCEPT_TYPES,
    triggerFileSelect,
    onFileChange,
  }
}
