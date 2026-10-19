/**
 * @file 页面预览 / 版本比较 / 导出 PDF / 兼容性验收接口
 * @description 对应 API.md 附录 A.4、A.5。
 *
 * 关键语义：
 *   - 预览、比较、导出、验收都**绑定明确版本**，不要用「最新版本」代替；
 *   - 渲染后端未配置时：元信息接口返回 previewable=false + message（HTTP 200），
 *     页面图片接口返回 503 —— 两者要区别对待，前者是"不支持"，后者是"服务端没配好"；
 *   - 比较结果是块/单元格粒度，不是字符粒度；truncated=true 时 changes 不完整。
 */

import { API_ENDPOINTS } from './endpoints'
import { getBlob, getData, postData } from './http'
import type {
  CompatibilityReport,
  VersionCompareResult,
  VersionPreviewMeta,
} from './types'

/** 页面预览接口集合 */
export const previewApi = {
  /**
   * 读取预览元信息
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getMeta(fileId: number, versionNo: number): Promise<VersionPreviewMeta> {
    return getData<VersionPreviewMeta>(API_ENDPOINTS.file.preview(fileId, versionNo), { timeout: 120000 })
  },

  /**
   * 渲染指定页为 PNG
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param pageNo 页码，从 1 开始
   * @param dpi 渲染 DPI，默认由后端决定（110），允许 60～200
   * @returns PNG 字节流
   */
  getPageImage(fileId: number, versionNo: number, pageNo: number, dpi?: number): Promise<Blob> {
    const base = API_ENDPOINTS.file.pagePreview(fileId, versionNo, pageNo)
    // dpi 为可选查询参数，不传时由后端使用默认值
    const url = dpi === undefined ? base : `${base}?dpi=${dpi}`
    return getBlob(url, { timeout: 120000 })
  },

  /**
   * 比较两个版本的块级差异
   * @param fileId 文件 ID
   * @param fromVersion 基准版本号
   * @param toVersion 目标版本号
   */
  compare(fileId: number, fromVersion: number, toVersion: number): Promise<VersionCompareResult> {
    return getData<VersionCompareResult>(
      API_ENDPOINTS.file.compare(fileId, fromVersion, toVersion),
    )
  },

  /**
   * 将指定版本导出为 PDF
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @returns PDF 字节流（版本本身是 PDF 时返回原内容）
   */
  exportPdf(fileId: number, versionNo: number): Promise<Blob> {
    return getBlob(API_ENDPOINTS.file.exportPdf(fileId, versionNo), { timeout: 120000 })
  },

  /**
   * DOCX 应用级兼容性验收（仅 DOCX，需要真实排版，耗时较长）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  compatibilityCheck(fileId: number, versionNo: number): Promise<CompatibilityReport> {
    return postData<CompatibilityReport>(
      API_ENDPOINTS.file.compatibilityCheck(fileId, versionNo),
      undefined,
      { timeout: 180000 },
    )
  },
}
