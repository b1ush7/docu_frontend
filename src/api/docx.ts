/**
 * @file DOCX 读取与编辑接口
 * @description 除结构读取外，覆盖 API.md 4.4 ～ 4.11 的受控编辑能力：
 *              段落文本替换、段落插入删除、表格编辑、段落格式、内嵌图片、
 *              页眉页脚链接、正文脚注、目录域。
 *
 * 两条必须遵守的规则：
 *   1. 所有编辑接口都**绑定明确版本号**，并且每次成功编辑都会创建**一个新版本**；
 *      整批 operations 只产生一个版本，不是一条一个版本。
 *   2. `blockId` 只在单一版本内稳定，编辑后必须重新 `getStructure` 才能继续操作。
 */

import { API_ENDPOINTS } from './endpoints'
import { getData, postData } from './http'
import type {
  CreateDocxTableOfContentsParams,
  DocxFootnotes,
  DocxHeaderFooterLinks,
  DocxStructure,
  DocxTableOfContents,
  EditDocxFootnotesParams,
  EditDocxParagraphsParams,
  EditDocxTableParams,
  FileAsset,
  FormatDocxParagraphsParams,
  GenerateDocxParams,
  InsertDocxImagesParams,
  ReplaceDocxTextParams,
  UpdateDocxHeaderFooterLinkParams,
  Version,
} from './types'

/** DOCX 结构与编辑 API 集合 */
export const docxApi = {
  /**
   * 读取某个文件某个版本的 DOCX 结构（仅 DOCX 支持）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @returns 结构块列表及版本信息
   */
  getStructure(fileId: number, versionNo: number): Promise<DocxStructure> {
    return getData<DocxStructure>(API_ENDPOINTS.file.structure(fileId, versionNo))
  },

  /**
   * 替换段落文本（4.4）
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 1～100 个段落替换操作 + 可选编辑说明
   * @returns 新创建的版本
   */
  replaceParagraphText(
    fileId: number,
    versionNo: number,
    params: ReplaceDocxTextParams,
  ): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.paragraphText(fileId, versionNo), params)
  },

  /**
   * 插入或删除段落（4.5）
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 1～100 个段落编辑操作
   * @returns 新创建的版本
   */
  editParagraphs(
    fileId: number,
    versionNo: number,
    params: EditDocxParagraphsParams,
  ): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.paragraphEdits(fileId, versionNo), params)
  },

  /**
   * 编辑表格（4.6）：单元格文本、增删行、行高列宽、合并拆分、重复表头
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 1～100 个表格编辑操作
   * @returns 新创建的版本
   */
  editTable(fileId: number, versionNo: number, params: EditDocxTableParams): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.tableEdits(fileId, versionNo), params)
  },

  /**
   * 设置段落格式（4.7）：标题级别、列表、正文、段前分页
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 1～100 个格式操作
   * @returns 新创建的版本
   */
  formatParagraphs(
    fileId: number,
    versionNo: number,
    params: FormatDocxParagraphsParams,
  ): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.paragraphFormats(fileId, versionNo), params)
  },

  /**
   * 将已有 PNG/JPEG 文件的明确版本以内嵌方式插入段落（4.8）
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 1～20 个图片插入操作
   * @returns 新创建的版本
   */
  insertInlineImages(
    fileId: number,
    versionNo: number,
    params: InsertDocxImagesParams,
  ): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.inlineImages(fileId, versionNo), params)
  },

  /**
   * 查询各分节的页眉页脚链接状态（4.9 GET）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getHeaderFooterLinks(fileId: number, versionNo: number): Promise<DocxHeaderFooterLinks> {
    return getData<DocxHeaderFooterLinks>(
      API_ENDPOINTS.file.headerFooterLinks(fileId, versionNo),
    )
  },

  /**
   * 设置某分节的页眉页脚链接到上一节或取消链接（4.9 POST）
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 分节序号 + 位置 + 类型 + 链接状态；取消链接时需给 text
   * @returns 新创建的版本
   */
  updateHeaderFooterLink(
    fileId: number,
    versionNo: number,
    params: UpdateDocxHeaderFooterLinkParams,
  ): Promise<Version> {
    return postData<Version>(
      API_ENDPOINTS.file.headerFooterLinks(fileId, versionNo),
      params,
    )
  },

  /**
   * 查询正文脚注及引用段落（4.10 GET）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getFootnotes(fileId: number, versionNo: number): Promise<DocxFootnotes> {
    return getData<DocxFootnotes>(API_ENDPOINTS.file.footnotes(fileId, versionNo))
  },

  /**
   * 新增、修改或删除正文脚注（4.10 POST），单次最多 50 个操作
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 脚注操作列表
   * @returns 新创建的版本
   */
  editFootnotes(
    fileId: number,
    versionNo: number,
    params: EditDocxFootnotesParams,
  ): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.footnotes(fileId, versionNo), params)
  },

  /**
   * 查询 TOC 域及打开时更新标记（4.11 GET）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getTableOfContents(fileId: number, versionNo: number): Promise<DocxTableOfContents> {
    return getData<DocxTableOfContents>(
      API_ENDPOINTS.file.tableOfContents(fileId, versionNo),
    )
  },

  /**
   * 插入目录域或请求下次打开时刷新（4.11 POST）
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 位置 / 层级 / 超链接 / 标题，均可省略（后端有默认值）
   * @returns 新创建的版本
   */
  createTableOfContents(
    fileId: number,
    versionNo: number,
    params: CreateDocxTableOfContentsParams = {},
  ): Promise<Version> {
    return postData<Version>(
      API_ENDPOINTS.file.tableOfContents(fileId, versionNo),
      params,
    )
  },

  /**
   * 按结构块或公共模板生成新的 DOCX 文件（4.2）
   *
   * 两种模式**不能混用**：
   * - 模板模式：`templateId`（可选 `templateVersion`）+ `variables`
   * - 结构块模式：`blocks`
   *
   * 生成的是**新文件**，不是既有文件的新版本，所以返回 FileAsset 而不是 Version。
   * @param params 生成参数
   */
  generate(params: GenerateDocxParams): Promise<FileAsset> {
    return postData<FileAsset>(API_ENDPOINTS.file.docxGenerate, params)
  },
}
