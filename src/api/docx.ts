/**
 * @file DOCX 结构读取接口
 * @description 读取指定版本 DOCX 的段落 / 标题 / 表格 / 图片结构，
 *              用于右侧主内容区的文稿预览渲染。
 *              注意：blockId 只在单一版本内稳定，编辑产生新版本后必须重新读取。
 */

import { API_ENDPOINTS } from './endpoints'
import { getData } from './http'
import type { DocxStructure } from './types'

/** DOCX 结构 API 集合 */
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
}
