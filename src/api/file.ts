/**
 * @file 文件模块接口
 * @description 文件上传、列表、详情、重命名、删除、下载与版本列表，路径见 endpoints.ts。
 */

import { API_ENDPOINTS } from './endpoints'
import { deleteData, getBlob, getData, postData, putData } from './http'
import type { EditImageParams, FileAsset, FileListParams, PageResult, Version } from './types'

/** 文件模块 API 集合 */
export const fileApi = {
  /**
   * 上传文件（multipart/form-data，表单字段名固定为 file）
   * 服务端按实际内容识别类型并建立版本 1，成功返回文件资产。
   * @param file 用户选择的本地文件对象
   * @param onProgress 上传进度回调（0～100）；大文件上传时用于展示进度
   * @returns 新建的文件资产 FileAsset
   */
  upload(file: File, onProgress?: (percent: number) => void): Promise<FileAsset> {
    const form = new FormData()
    // 字段名必须为 file，与后端 @RequestParam 约定一致
    form.append('file', file)
    return postData<FileAsset>(API_ENDPOINTS.file.upload, form, {
      timeout: 120000,
      onUploadProgress: (event) => {
        // event.total 在长度可知时才有值，避免除零
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      },
    })
  },

  /**
   * 分页获取当前用户文件列表，按创建时间倒序
   * @param params 分页 / 关键字 / 状态过滤参数
   * @returns 分页结果
   */
  list(params?: FileListParams): Promise<PageResult<FileAsset>> {
    return getData<PageResult<FileAsset>>(API_ENDPOINTS.file.list, { params })
  },

  /**
   * 获取文件详情
   * @param fileId 文件 ID
   * @returns 文件资产
   */
  detail(fileId: number): Promise<FileAsset> {
    return getData<FileAsset>(API_ENDPOINTS.file.detail(fileId))
  },

  /**
   * 重命名文件（只修改展示名，不影响底层存储与历史版本）
   * @param fileId 文件 ID
   * @param displayName 新展示名，最长 200 字符
   * @returns 更新后的文件资产
   */
  rename(fileId: number, displayName: string): Promise<FileAsset> {
    return putData<FileAsset>(`${API_ENDPOINTS.file.detail(fileId)}/name`, { displayName })
  },

  /**
   * 软删除文件（历史记录与磁盘内容保留；重复删除返回成功）
   * @param fileId 文件 ID
   * @returns 固定为 null
   */
  remove(fileId: number): Promise<null> {
    return deleteData<null>(API_ENDPOINTS.file.detail(fileId))
  },

  /**
   * 下载文件记录当前内容（二进制流，由调用方触发浏览器保存）
   * @param fileId 文件 ID
   * @returns 文件 Blob
   */
  download(fileId: number): Promise<Blob> {
    return getBlob(API_ENDPOINTS.file.download(fileId))
  },

  /**
   * 获取版本列表，按版本号倒序
   * @param fileId 文件 ID
   * @returns 版本数组
   */
  versions(fileId: number): Promise<Version[]> {
    return getData<Version[]>(API_ENDPOINTS.file.versions(fileId))
  },

  /**
   * 获取指定版本详情
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @returns 版本记录
   */
  versionDetail(fileId: number, versionNo: number): Promise<Version> {
    return getData<Version>(API_ENDPOINTS.file.versionDetail(fileId, versionNo))
  },

  /**
   * 下载指定版本内容（二进制流，由调用方触发浏览器保存）
   * 使用该版本独立保存的 MIME 类型与扩展名，不随当前文件格式变化
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @returns 文件 Blob
   */
  downloadVersion(fileId: number, versionNo: number): Promise<Blob> {
    return getBlob(API_ENDPOINTS.file.versionDownload(fileId, versionNo))
  },

  /**
   * 恢复历史版本：不覆盖历史，复用目标版本内容与格式创建新的 RESTORE 版本
   * @param fileId 文件 ID
   * @param versionNo 要恢复到的目标版本号
   * @param expectVersion 客户端认为的当前最新版本号；与最新版本不一致时后端返回 409 阻止并发覆盖
   * @returns 新创建的 RESTORE 版本记录
   */
  restoreVersion(fileId: number, versionNo: number, expectVersion?: number): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.versionRestore(fileId, versionNo), undefined, {
      // expectVersion 为可选乐观锁参数，未传时不携带查询参数
      params: expectVersion !== undefined ? { expectVersion } : undefined,
    })
  },

  /**
   * 编辑 PNG/JPEG 像素或转换格式，保存为带独立格式信息的新版本（3.20）
   *
   * 只支持图片版本；单次最多 20 个操作，按数组顺序作用在同一张图上。
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 输出格式 / JPEG 质量 / 操作列表
   * @returns 新创建的版本
   */
  editImage(fileId: number, versionNo: number, params: EditImageParams): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.imageEdits(fileId, versionNo), params)
  },
}
