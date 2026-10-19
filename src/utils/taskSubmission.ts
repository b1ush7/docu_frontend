import type { TaskCreateParams, TaskCreateType, Version } from '@/api/types'

const PDF_EXPORT = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'doc', 'xls', 'ppt'])
export function availableTaskTypes(extension: string): TaskCreateType[] {
  const ext = extension.toLowerCase()
  return [...(ext === 'pdf' ? ['CONVERT' as const] : []), ...(PDF_EXPORT.has(ext) ? ['EXPORT' as const] : [])]
}
export function createTaskRequest(fileId: number, version: Pick<Version, 'versionNo' | 'extension'>,
  taskType: TaskCreateType, mode: 'EDITABLE' | 'LAYOUT', idempotencyKey: string): TaskCreateParams {
  if (!Number.isSafeInteger(fileId) || fileId < 1 || !Number.isInteger(version.versionNo) || version.versionNo < 1) {
    throw new Error('请选择有效文件和明确版本')
  }
  if (!availableTaskTypes(version.extension).includes(taskType)) throw new Error('该版本格式不支持此转换操作')
  return { fileId, inputVersion: version.versionNo, taskType, idempotencyKey,
    instruction: taskType === 'CONVERT' ? mode === 'LAYOUT' ? 'PDF 转 DOCX，优先保持版式（layout）' : 'PDF 转可编辑 DOCX（editable）' : '导出为 PDF 新版本' }
}
