// 全站统一的枚举中文映射（10 组）
export const USER_ROLE = {
  USER: { label: '普通用户', tag: 'info' },
  ADMIN: { label: '管理员', tag: 'danger' },
}

export const ACCOUNT_STATUS = {
  ENABLED: { label: '已启用', tag: 'success' },
  DISABLED: { label: '已禁用', tag: 'danger' },
}

export const FILE_STATUS = {
  READY: { label: '正常', tag: 'success' },
  DELETED: { label: '已删除', tag: 'info' },
  QUARANTINED: { label: '已隔离', tag: 'warning' },
}

export const FILE_SOURCE = {
  UPLOAD: { label: '用户上传', tag: 'info' },
  GENERATED: { label: '系统生成', tag: 'success' },
  CONVERTED: { label: '格式转换', tag: 'warning' },
}

export const VERSION_CHANGE_TYPE = {
  CREATE: '创建',
  EDIT: '编辑',
  AI_EDIT: 'AI 编辑',
  CONVERT: '格式转换',
  RESTORE: '版本恢复',
  RENAME: '重命名',
}

export const TASK_STATUS = {
  PENDING: { label: '排队中', tag: 'info' },
  RUNNING: { label: '执行中', tag: 'primary' },
  SUCCEEDED: { label: '已成功', tag: 'success' },
  FAILED: { label: '已失败', tag: 'danger' },
  CANCELLED: { label: '已取消', tag: 'warning' },
}

export const TASK_TYPE = {
  OCR: 'OCR 识别',
  CONVERT: '格式转换',
  AI_EDIT: 'AI 编辑',
  EXPORT: '导出',
  IMAGE_GEN: '图片生成',
}

export const STEP_STATUS = {
  PENDING: { label: '等待中', tag: 'info' },
  RUNNING: { label: '执行中', tag: 'primary' },
  SUCCEEDED: { label: '已成功', tag: 'success' },
  FAILED: { label: '已失败', tag: 'danger' },
  SKIPPED: { label: '已跳过', tag: 'warning' },
}

export const MODEL_SCOPE = {
  TEXT: { label: '文本模型', tag: 'primary' },
  IMAGE: { label: '图片模型', tag: 'success' },
  OCR: { label: 'OCR 模型', tag: 'warning' },
}

export const CONFIG_STATUS = {
  ENABLED: { label: '已启用', tag: 'success' },
  DISABLED: { label: '已停用', tag: 'info' },
}

// 模型 provider 固定枚举（当前唯一值，后续可扩展）
export const MODEL_PROVIDERS = [{ value: 'openai-compatible', label: 'openai-compatible' }]

// 模板预置分类（值待与产品确认，先按常见分类预置）
export const TEMPLATE_CATEGORIES = ['通用', '报告', '合同', '简历', '通知', '论文']

export function enumLabel(map, key) {
  const item = map?.[key]
  return item ? (item.label ?? item) : key ?? '-'
}

export function enumTag(map, key) {
  return map?.[key]?.tag || 'info'
}
