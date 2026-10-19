/**
 * @file XLSX 读取与编辑接口
 * @description 对应 API.md 3.13 ～ 3.21：
 *              结构读取、区域读取、公式即时计算，以及单元格 / 行列 / 工作表 / 排序筛选 /
 *              格式 / 内嵌图片六类受控编辑。
 *
 * 规则：
 *   1. 所有编辑都**绑定明确版本号**，每次成功编辑创建一个新版本；
 *      整批 operations 只产生一个版本，不是一条一个版本。
 *   2. 结构与区域接口是只读的；公式即时计算**不保存新版本**。
 *   3. 工作表名 1～31 字符，单元格用 A1 记法，区域用 A1:C3 记法。
 */

import { API_ENDPOINTS } from './endpoints'
import { getData, postData } from './http'
import type {
  EditXlsxCellsParams,
  EditXlsxDataParams,
  EditXlsxSheetsParams,
  EditXlsxStructureParams,
  FormatXlsxCellsParams,
  InsertXlsxImagesParams,
  Version,
  XlsxFormulaResults,
  XlsxRange,
  XlsxStructure,
} from './types'

/** XLSX 读取与编辑 API 集合 */
export const xlsxApi = {
  /**
   * 读取某个版本的工作表、单元格、样式、公式、合并区域与图表（3.13）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   */
  getStructure(fileId: number, versionNo: number): Promise<XlsxStructure> {
    return getData<XlsxStructure>(API_ENDPOINTS.file.xlsxStructure(fileId, versionNo))
  },

  /**
   * 读取一个明确的矩形区域，包含区域内未创建的空白位置
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param sheetName 工作表名
   * @param range A1:C3 格式的区域
   */
  getRange(fileId: number, versionNo: number, sheetName: string, range: string): Promise<XlsxRange> {
    return getData<XlsxRange>(API_ENDPOINTS.file.xlsxRange(fileId, versionNo), {
      params: { sheetName, range },
    })
  },

  /**
   * 即时计算区域内公式，返回结果或错误，**不保存新版本**（3.19）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param sheetName 工作表名
   * @param range A1:C3 格式的区域
   */
  calculateFormulas(
    fileId: number,
    versionNo: number,
    sheetName: string,
    range: string,
  ): Promise<XlsxFormulaResults> {
    return getData<XlsxFormulaResults>(API_ENDPOINTS.file.xlsxFormulaResults(fileId, versionNo), {
      params: { sheetName, range },
    })
  },

  /**
   * 修改单元格值或公式并保存为新版本（3.14），单次最多 500 个操作
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 操作列表；可选 recalculateFormulas 重算整个工作簿
   */
  editCells(fileId: number, versionNo: number, params: EditXlsxCellsParams): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.xlsxCellEdits(fileId, versionNo), params)
  },

  /**
   * 插入或删除行列并保存为新版本（3.15）
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 操作列表
   */
  editStructure(
    fileId: number,
    versionNo: number,
    params: EditXlsxStructureParams,
  ): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.xlsxStructureEdits(fileId, versionNo), params)
  },

  /**
   * 新增、重命名或删除工作表并保存为新版本（3.16）
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 操作列表
   */
  editSheets(fileId: number, versionNo: number, params: EditXlsxSheetsParams): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.xlsxSheetEdits(fileId, versionNo), params)
  },

  /**
   * 对安全区域排序，或设置/清除自动筛选，并保存为新版本（3.17）
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 操作列表
   */
  editData(fileId: number, versionNo: number, params: EditXlsxDataParams): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.xlsxDataEdits(fileId, versionNo), params)
  },

  /**
   * 设置单元格或区域的基础格式并保存为新版本（3.18）
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 操作列表
   */
  formatCells(fileId: number, versionNo: number, params: FormatXlsxCellsParams): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.xlsxFormats(fileId, versionNo), params)
  },

  /**
   * 把当前用户图片的明确版本内嵌到 XLSX，以单元格左上角定位，并保存为新版本（3.21）
   * @param fileId 文件 ID
   * @param versionNo 基准版本号
   * @param params 1～20 个图片插入操作
   */
  insertImages(
    fileId: number,
    versionNo: number,
    params: InsertXlsxImagesParams,
  ): Promise<Version> {
    return postData<Version>(API_ENDPOINTS.file.xlsxImages(fileId, versionNo), params)
  },
}
