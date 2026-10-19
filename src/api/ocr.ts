/**
 * @file OCR 接口（API.md 3.11.1）
 * @description 对明确的 PDF 或图片版本做同步识别，并提供逐页人工校正与只读整理。
 *
 * 三条要点：
 *   1. 识别是**同步**的，不创建新版本；识别结果里的 `fingerprint` 是保存校正的唯一凭据。
 *   2. 校正保存**不覆盖 PDF/图片，也不创建版本**；指纹与当前识别结果不一致时后端返回 409，
 *      避免把校正套用到另一份内容上。
 *   3. `organize` 只让文本模型**只读整理**校正内容，同样不产生版本。
 */

import { API_ENDPOINTS } from './endpoints'
import { getData, postData, putData } from './http'
import type {
  AgentRunResult,
  OcrCorrection,
  OcrParams,
  OcrResult,
  SaveOcrCorrectionsParams,
} from './types'

/** OCR API 集合 */
export const ocrApi = {
  /**
   * 同步识别 PDF 扫描页或 PNG/JPEG
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param params 语言 / 页码 / DPI / 增强 / 区域；可整体省略
   */
  recognize(fileId: number, versionNo: number, params?: OcrParams): Promise<OcrResult> {
    return postData<OcrResult>(API_ENDPOINTS.file.ocr(fileId, versionNo), params)
  },

  /**
   * 识别并导出 UTF-8 纯文本（二进制流，由调用方触发下载）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param params 同识别参数，可省略
   */
  exportText(fileId: number, versionNo: number, params?: OcrParams): Promise<Blob> {
    return postData<Blob>(API_ENDPOINTS.file.ocrText(fileId, versionNo), params, {
      responseType: 'blob',
    })
  },

  /**
   * 保存逐页人工校正（不产生版本）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param params 指纹 + 逐页校正文本与表格
   */
  saveCorrections(
    fileId: number,
    versionNo: number,
    params: SaveOcrCorrectionsParams,
  ): Promise<OcrCorrection> {
    return putData<OcrCorrection>(API_ENDPOINTS.file.ocrCorrections(fileId, versionNo), params)
  },

  /**
   * 读取已保存的逐页人工校正
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param fingerprint OCR 结果指纹（64 位小写十六进制）
   */
  getCorrections(fileId: number, versionNo: number, fingerprint: string): Promise<OcrCorrection> {
    return getData<OcrCorrection>(
      API_ENDPOINTS.file.ocrCorrection(fileId, versionNo, fingerprint),
    )
  },

  /**
   * 把已保存的人工校正交给文本模型只读整理（不产生版本）
   * @param fileId 文件 ID
   * @param versionNo 版本号
   * @param fingerprint OCR 结果指纹
   * @param instruction 整理要求，最长 500
   */
  organizeCorrections(
    fileId: number,
    versionNo: number,
    fingerprint: string,
    instruction?: string,
  ): Promise<AgentRunResult> {
    return postData<AgentRunResult>(
      API_ENDPOINTS.file.ocrCorrectionOrganize(fileId, versionNo, fingerprint),
      instruction === undefined ? undefined : { instruction },
    )
  },
}
