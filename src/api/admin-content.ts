/**
 * @file 管理端跨用户文档查看与审计日志接口
 * @description 对应 API.md 7.7（跨用户版本与文档结构）与 7.15（审计日志查询）。
 *
 * 与用户端的区别：
 *   - 路径前缀是 /admin/files/... ，可读取**任意用户**的文件与版本；
 *   - 归属校验由后端按管理员角色放行，前端不做额外判断；
 *   - 这些接口会写入审计日志（如 ADMIN_FILE_VIEW），所以不要在高频轮询里调用。
 *
 * 基础管理端点（用户/文件/任务 CRUD）仍在 api/admin.js 中，本文件只补缺口。
 */

import { API_ENDPOINTS } from './endpoints'
import { getBlob, getData } from './http'
import type {
  AuditLog,
  AuditQueryParams,
  DocxStructure,
  PageResult,
  PdfContent,
  Version,
  VersionPreviewMeta,
  XlsxFormulaResults,
  XlsxRange,
  XlsxStructure,
} from './types'

/** 管理端文档查看 API 集合 */
export const adminDocsApi = {
  /**
   * 任意用户的版本列表（按版本号倒序）
   * @param fileId 文件 ID
   */
  listVersions(fileId: number): Promise<Version[]> {
    return getData<Version[]>(API_ENDPOINTS.admin.versions(fileId))
  },

  /**
   * 任意用户的版本详情
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getVersion(fileId: number, versionNo: number): Promise<Version> {
    return getData<Version>(API_ENDPOINTS.admin.versionDetail(fileId, versionNo))
  },

  /**
   * 下载任意用户的指定版本（二进制流，由调用方触发保存）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  downloadVersion(fileId: number, versionNo: number): Promise<Blob> {
    return getBlob(API_ENDPOINTS.admin.versionDownload(fileId, versionNo))
  },

  /**
   * 读取任意用户版本的 DOCX 结构
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getDocxStructure(fileId: number, versionNo: number): Promise<DocxStructure> {
    return getData<DocxStructure>(API_ENDPOINTS.admin.structure(fileId, versionNo))
  },

  /**
   * 读取任意用户版本的 XLSX 结构
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getXlsxStructure(fileId: number, versionNo: number): Promise<XlsxStructure> {
    return getData<XlsxStructure>(API_ENDPOINTS.admin.xlsxStructure(fileId, versionNo))
  },

  /**
   * 读取任意用户版本的一个矩形区域
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param sheetName 工作表名
   * @param range A1:C3 格式
   */
  getXlsxRange(
    fileId: number,
    versionNo: number,
    sheetName: string,
    range: string,
  ): Promise<XlsxRange> {
    return getData<XlsxRange>(API_ENDPOINTS.admin.xlsxRange(fileId, versionNo), {
      params: { sheetName, range },
    })
  },

  /**
   * 即时计算任意用户版本指定区域的公式（不保存版本）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param sheetName 工作表名
   * @param range A1:C3 格式
   */
  calculateXlsxFormulas(
    fileId: number,
    versionNo: number,
    sheetName: string,
    range: string,
  ): Promise<XlsxFormulaResults> {
    return getData<XlsxFormulaResults>(API_ENDPOINTS.admin.xlsxFormulaResults(fileId, versionNo), {
      params: { sheetName, range },
    })
  },

  /**
   * 读取任意用户版本的 PDF 原生文本与页面类型（不做 OCR）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getPdfContent(fileId: number, versionNo: number): Promise<PdfContent> {
    return getData<PdfContent>(API_ENDPOINTS.admin.pdfContent(fileId, versionNo))
  },

  /**
   * 渲染任意用户 PDF 的指定页为 PNG
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param pageNo 页码，从 1 开始
   * @param dpi 可选，不传由后端使用默认值
   */
  getPdfPageImage(
    fileId: number,
    versionNo: number,
    pageNo: number,
    dpi?: number,
  ): Promise<Blob> {
    // 直接内联端点调用：契约核对脚本按文件级作用域解析变量，复用同名局部变量会串味
    return getBlob(
      dpi === undefined
        ? API_ENDPOINTS.admin.pdfPagePreview(fileId, versionNo, pageNo)
        : `${API_ENDPOINTS.admin.pdfPagePreview(fileId, versionNo, pageNo)}?dpi=${dpi}`,
    )
  },

  /**
   * 任意用户版本的预览元信息
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getPreviewMeta(fileId: number, versionNo: number): Promise<VersionPreviewMeta> {
    return getData<VersionPreviewMeta>(API_ENDPOINTS.admin.preview(fileId, versionNo))
  },

  /**
   * 渲染任意用户版本指定页为 PNG
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param pageNo 页码，从 1 开始
   * @param dpi 可选，不传由后端使用默认值
   */
  getPageImage(fileId: number, versionNo: number, pageNo: number, dpi?: number): Promise<Blob> {
    // 同上：内联端点调用，避免与其它函数的同名局部变量冲突
    return getBlob(
      dpi === undefined
        ? API_ENDPOINTS.admin.pagePreview(fileId, versionNo, pageNo)
        : `${API_ENDPOINTS.admin.pagePreview(fileId, versionNo, pageNo)}?dpi=${dpi}`,
    )
  },
}

/** 管理端审计日志 API 集合 */
export const adminAuditApi = {
  /**
   * 分页查询审计日志（固定按时间倒序）
   * @param params 分页 + 操作者/动作/目标/结果/时间/请求 ID 过滤
   */
  list(params?: AuditQueryParams): Promise<PageResult<AuditLog>> {
    return getData<PageResult<AuditLog>>(API_ENDPOINTS.admin.auditLogs, { params })
  },
}
