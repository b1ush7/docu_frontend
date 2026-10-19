/**
 * @file PDF 接口（API.md 3.11 / 3.12 / 3.22）
 * @description 读取 PDF 原生文本与页面分类、渲染页面 PNG、转换为可编辑 DOCX。
 *
 * 要点：
 *   1. `getContent` 只做**原生文本提取与分类**，扫描页只标记为 SCANNED，不在此处 OCR；
 *      需要扫描页文字请走 `ocrApi.recognize`。
 *   2. 页面渲染依赖服务端渲染后端，未配置时返回 503；
 *      `dpi` 允许 60～200，不传由后端使用默认值。
 *   3. `convertToDocx` 会**创建一个新版本**；`ocrLanguage` 为空时遇到无原生文字的页面返回 422。
 */

import { API_ENDPOINTS } from './endpoints'
import { getBlob, getData, postData } from './http'
import type { ConvertPdfToDocxParams, PdfContent, Version } from './types'

/** PDF API 集合 */
export const pdfApi = {
  /**
   * 读取 PDF 原生文本与按页类型（TEXT / SCANNED / MIXED / EMPTY）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getContent(fileId: number, versionNo: number): Promise<PdfContent> {
    return getData<PdfContent>(API_ENDPOINTS.file.pdfContent(fileId, versionNo))
  },

  /**
   * 将指定页渲染为 PNG
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param pageNo 页码，从 1 开始
   * @param dpi 可选，允许 60～200，不传用后端默认值
   */
  getPageImage(fileId: number, versionNo: number, pageNo: number, dpi?: number): Promise<Blob> {
    // 内联端点调用：契约脚本按文件级作用域解析变量，避免与其它函数同名变量冲突
    return getBlob(
      dpi === undefined
        ? API_ENDPOINTS.file.pdfPagePreview(fileId, versionNo, pageNo)
        : `${API_ENDPOINTS.file.pdfPagePreview(fileId, versionNo, pageNo)}?dpi=${dpi}`,
    )
  },

  /**
   * 将 PDF 重建为可编辑 DOCX 新版本
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param params 转换取向（EDITABLE / LAYOUT）+ 可选 OCR 语言与说明
   * @returns 新创建的版本
   */
  convertToDocx(
    fileId: number,
    versionNo: number,
    params: ConvertPdfToDocxParams,
  ): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.pdfConvertToDocx(fileId, versionNo), params)
  },
}
