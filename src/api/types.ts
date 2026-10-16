/**
 * @file 后端数据类型定义
 * @description 与 API.md 第 6 节数据结构一一对应，字段含义以 API.md 为准。
 *              后端时间格式为 ISO-8601 本地时间字符串，如 2026-10-11T14:30:00。
 */

// ==================== 通用结构 ====================

/** 统一 JSON 响应外层结构（除文件下载接口外所有接口） */
export interface ApiEnvelope<T> {
  /** 业务状态码：0 表示成功，非 0 表示失败 */
  code: number
  /** 提示或错误信息；部分成功响应为空字符串 */
  msg: string
  /** 业务数据，可能为 null */
  data: T
}

/** 统一分页响应结构 */
export interface PageResult<T> {
  /** 当前页数据列表 */
  records: T[]
  /** 数据总条数 */
  total: number
  /** 当前页码，从 1 开始 */
  page: number
  /** 每页条数 */
  size: number
  /** 总页数 */
  pages: number
}

// ==================== 用户与认证 ====================

/** 双 Token 凭据（登录 / 刷新成功时返回） */
export interface TokenPair {
  /** 访问令牌，请求头 Authorization: Bearer <accessToken> */
  accessToken: string
  /** 刷新令牌，用于过期后换取新的一对 Token */
  refreshToken: string
  /** accessToken 剩余有效秒数 */
  expiresIn: number
  /** refreshToken 剩余有效秒数 */
  refreshExpiresIn: number
}

/** 当前用户信息（GET /user/me 返回；注意：后端暂无昵称与头像字段，展示层用 username 代替） */
export interface UserInfo {
  /** 用户 ID */
  id: number
  /** 用户名（登录账号，同时作为界面展示名） */
  username: string
  /** 手机号，未绑定时为 null */
  phone: string | null
  /** 账号角色：USER 普通用户 / ADMIN 管理员 */
  role: string
  /** 账号状态：ENABLED 正常 / DISABLED 已禁用 */
  status: string
  /** 账户余额 */
  balance: number
  /** 注册时间 */
  createTime: string
  /** 最近登录时间，首次登录为 null */
  lastLoginTime: string | null
}

// ==================== 文件 ====================

/** 文件状态：READY 正常可用 / DELETED 已软删除 / QUARANTINED 被隔离 */
export type FileStatus = 'READY' | 'DELETED' | 'QUARANTINED'

/** 文件来源：UPLOAD 用户上传 / GENERATED 按结构生成 */
export type FileSource = 'UPLOAD' | 'GENERATED'

/** 文件资产（文件主记录），服务端不返回内部存储标识 storageKey */
export interface FileAsset {
  /** 文件 ID */
  id: number
  /** 初始文件名（上传时的原始名称） */
  originalName: string
  /** 当前展示名（可被重命名修改） */
  displayName: string
  /** 服务端按实际内容识别的 MIME 类型 */
  contentType: string
  /** 规范化扩展名，不带点，如 docx */
  extension: string
  /** 文件内容大小（字节） */
  sizeBytes: number
  /** 文件内容 SHA-256 摘要 */
  sha256: string
  /** 文件来源 */
  source: FileSource
  /** 文件状态 */
  status: FileStatus
  /** 当前最新版本号 */
  latestVersion: number
  /** 创建时间 */
  createTime: string
  /** 更新时间 */
  updateTime: string
}

/** 文件列表查询参数 */
export interface FileListParams {
  /** 页码，大于等于 1，默认 1 */
  page?: number
  /** 每页条数，1～100，默认 20 */
  size?: number
  /** 展示名模糊搜索关键字，最长 100 字符 */
  keyword?: string
  /** 按状态过滤，默认 READY */
  status?: FileStatus
}

// ==================== 版本 ====================

/** 版本变更类型：上传 / AI 编辑 / 人工编辑 / 格式转换 / 历史恢复 */
export type ChangeType = 'UPLOAD' | 'AI_EDIT' | 'MANUAL_EDIT' | 'CONVERT' | 'RESTORE'

/** 文档版本记录；所有编辑都会创建新版本，不原地覆盖 */
export interface Version {
  /** 版本记录 ID */
  id: number
  /** 所属文件 ID */
  fileId: number
  /** 版本号，从 1 开始 */
  versionNo: number
  /** 来源版本号；首版为 null */
  parentVersion: number | null
  /** 该版本独立保存的 MIME 类型（历史版本可能与当前文件格式不同，如 PNG 转 JPEG 后 v1 仍是 PNG） */
  contentType: string
  /** 该版本独立保存的规范化扩展名，不带点 */
  extension: string
  /** 该版本文件字节数 */
  sizeBytes: number
  /** 该版本内容 SHA-256 */
  sha256: string
  /** 创建该版本时的操作说明（用户指令或接口 instruction） */
  instruction: string | null
  /** 服务端生成的结果摘要 */
  resultSummary: string | null
  /** 变更类型 */
  changeType: ChangeType
  /** 创建时间 */
  createTime: string
}

// ==================== 异步任务 ====================

/** 任务状态：PENDING 排队 / RUNNING 执行中 / SUCCEEDED 成功 / FAILED 失败 / CANCELLED 已取消 */
export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

/** 任务类型：OCR 识别 / CONVERT 格式转换 / AI_EDIT AI编辑 / EXPORT 导出 / IMAGE_GEN 图片生成 */
export type TaskType = 'OCR' | 'CONVERT' | 'AI_EDIT' | 'EXPORT' | 'IMAGE_GEN'

/** 任务步骤状态：SKIPPED 表示该步骤被跳过 */
export type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED'

/** 异步任务记录 */
export interface Task {
  /** 任务 ID */
  id: number
  /** 关联文件 ID；纯生成任务为 null */
  fileId: number | null
  /** 任务类型 */
  taskType: TaskType
  /** 任务状态 */
  status: TaskStatus
  /** 执行进度，0～100 */
  progress: number
  /** 当前执行步骤名称 */
  currentStep: string | null
  /** 用户输入的指令 */
  instruction: string | null
  /** 脱敏错误码；无错误时为 null */
  errorCode: string | null
  /** 脱敏错误信息；无错误时为 null */
  errorMessage: string | null
  /** 输入版本号 */
  inputVersion: number | null
  /** 输出版本号；任务成功后可据此读取结果文档 */
  outputVersion: number | null
  /** 已自动重试次数 */
  retryCount: number
  /** 最大自动重试次数 */
  maxRetry: number
  /** 是否已请求取消（RUNNING 中取消为异步生效） */
  cancelRequested: boolean
  /** 创建时间 */
  createTime: string
  /** 开始执行时间；未开始为 null */
  startTime: string | null
  /** 结束时间；未结束为 null */
  finishTime: string | null
  /** 已耗时毫秒；未开始为 null */
  elapsedMs: number | null
}

/** 提交异步任务参数 */
export interface TaskCreateParams {
  /** 任务类型 */
  taskType: TaskType
  /** 关联文件 ID，必须是当前用户自己的文件 */
  fileId?: number
  /** 输入版本号；未传时使用文件当前最新版本 */
  inputVersion?: number
  /** 用户指令，如“把内容改写得更正式”，最长 2000 */
  instruction?: string
  /** 幂等键：同一用户相同键重复提交时返回已有任务，防止双击重复创建 */
  idempotencyKey?: string
  /** 期望的当前最新版本号，用于乐观锁（当前提交实现尚未启用该判断） */
  expectVersion?: number
  /** 任务超时秒数，10～3600，默认 600 */
  timeoutSeconds?: number
}

/** 任务列表查询参数 */
export interface TaskListParams {
  /** 页码，默认 1 */
  page?: number
  /** 每页条数，1～100，默认 20 */
  size?: number
  /** 按任务状态过滤 */
  status?: TaskStatus
  /** 按任务类型过滤 */
  taskType?: TaskType
  /** 按关联文件过滤 */
  fileId?: number
}

/** 任务单个步骤的执行记录 */
export interface TaskStep {
  /** 步骤序号，从 1 开始 */
  stepNo: number
  /** 步骤名称，如“解析请求” */
  stepName: string
  /** 步骤状态 */
  status: StepStatus
  /** 步骤执行结果说明 */
  detail: string | null
  /** 步骤错误信息；无错误时为 null */
  errorMessage: string | null
  /** 步骤开始时间 */
  startTime: string | null
  /** 步骤结束时间 */
  finishTime: string | null
  /** 步骤耗时毫秒 */
  durationMs: number | null
}

/** 任务详情响应：任务主体 + 全部步骤列表 */
export interface TaskDetail {
  /** 任务主体记录 */
  task: Task
  /** 执行步骤列表，按 stepNo 升序 */
  steps: TaskStep[]
}

// ==================== DOCX 结构 ====================

/** DOCX 结构块类型：段落 / 标题 / 表格 / 表格行 / 单元格 / 图片 */
export type DocBlockType = 'PARAGRAPH' | 'HEADING' | 'TABLE' | 'ROW' | 'CELL' | 'IMAGE'

/**
 * DOCX 结构块。
 * blockId 只在一个明确版本内稳定，创建新版本后必须重新读取结构。
 * 表格、行、单元格、单元格内段落通过 children 递归嵌套。
 */
export interface DocBlock {
  /** 块唯一标识，如 body/p0（正文第 1 段）、body/t0/r0/c1（表格 0 行 0 单元格 1） */
  blockId: string
  /** 块类型 */
  type: DocBlockType
  /** 文本内容；表格/图片等非文本块为 null */
  text: string | null
  /** 样式 ID，如 Heading1；无样式为 null */
  styleId: string | null
  /** 标题层级 1～9；非标题块为 null */
  headingLevel: number | null
  /** 图片名称；非图片块为 null */
  name: string | null
  /** 图片 MIME 类型；非图片块为 null */
  contentType: string | null
  /** 图片字节大小；非图片块为 null */
  sizeBytes: number | null
  /** 子块列表，用于表格等嵌套结构 */
  children: DocBlock[]
}

/** DOCX 结构读取响应 */
export interface DocxStructure {
  /** 文件 ID */
  fileId: number
  /** 结构对应的版本号 */
  versionNo: number
  /** 顶层结构块列表 */
  blocks: DocBlock[]
}
