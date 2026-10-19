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
  /** 访问令牌，请求头 Authorization: <accessToken>（不带 Bearer 前缀） */
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

/** 任务类型（**查询/展示用全集**）：OCR 识别 / CONVERT 格式转换 / AI_EDIT AI编辑 / EXPORT 导出 / IMAGE_GEN 图片生成 */
export type TaskType = 'OCR' | 'CONVERT' | 'AI_EDIT' | 'EXPORT' | 'IMAGE_GEN'

/**
 * 任务类型（**创建用子集**）。
 *
 * 后端 `CreateTaskDTO.taskType` 的校验正则是 `^(CONVERT|EXPORT)$`，
 * 即 `POST /task` 只接受这两种；`OCR` / `AI_EDIT` / `IMAGE_GEN` 仅作为历史任务的查询取值存在，
 * 新建时会被后端以 400 拒绝。OCR 与 AI 编辑请走各自的同步接口，不要创建异步任务。
 *
 * 这里刻意与 `TaskType` 分开，让「创建时用了不支持的类型」在编译期就报错，
 * 而不是等到运行时收到 400。
 */
export type TaskCreateType = 'CONVERT' | 'EXPORT'

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
  /**
   * 任务类型，只能是 CONVERT 或 EXPORT。
   * 后端 `CreateTaskDTO` 用 `^(CONVERT|EXPORT)$` 校验，其他值返回 400。
   */
  taskType: TaskCreateType
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
export type DocBlockType = 'PARAGRAPH' | 'HEADING' | 'TABLE' | 'ROW' | 'CELL' | 'IMAGE' | 'HEADER' | 'FOOTER'

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
  numberingFormat?: string | null
  pageBreakBefore?: boolean | null
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

// ==================== AI 会话与待确认编辑（API.md 附录 A.1 / 第 8 节）====================

/** 会话状态；ARCHIVED 后不再接收新回复 */
export type AiSessionStatus = 'ACTIVE' | 'ARCHIVED'

/** AI 会话 */
export interface AiSession {
  id: number
  /** 归属用户 */
  userId: number
  /** 绑定的文件；纯对话为 null */
  fileId: number | null
  title: string | null
  status: AiSessionStatus
  createTime: string
  updateTime: string
}

/** 会话列表查询参数 */
export interface AiSessionListParams {
  page?: number
  size?: number
  status?: AiSessionStatus
  fileId?: number
  keyword?: string
}

/** 生成回复请求体 */
export interface AiReplyRequest {
  /** 必填，非空，最多 2000 字符 */
  content: string
  /** 绑定文件时必填，必须为明确的正版本号；纯对话不允许传入 */
  versionNo?: number
  /** 必填，非空，最多 128 字符；一次发送意图对应一个稳定键 */
  idempotencyKey: string
  /** 可选，最多 5 条用户提供的资料来源（服务端不联网核验） */
  sources?: AiReplySource[]
}

/** 用户提供的资料来源（仅回显，不代表已核验） */
export interface AiReplySource {
  title: string
  url?: string
  excerpt?: string
}

/** 回复运行状态 */
export type AiRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED'

/** 待确认计划状态 */
export type AiPlanStatus = 'NONE' | 'PENDING' | 'CONFIRMED' | 'DISCARDED'

/** 一条 AI 回复消息 */
export interface AiMessage {
  id: number
  sessionId: number
  role: 'USER' | 'ASSISTANT' | 'TOOL' | 'SYSTEM'
  content: string
  modelName?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  durationMs?: number | null
}

/** 待确认修改的内容差异（仅在 planStatus=PENDING 时提供） */
export interface AiChange {
  type: string
  target: string
  /** 替换/删除的原文；插入为 null */
  before: string | null
  /** 替换/插入的新文；删除为 null */
  after: string | null
  reason?: string | null
  image?: { fileId: number; versionNo: number; widthPixels: number; heightPixels: number } | null
  format?: { type: string; level: number | null } | null
  beforeFormat?: {
    styleId: string | null
    headingLevel: number | null
    numberingFormat: string | null
    pageBreakBefore: boolean | null
  } | null
}

/** 回复用量与执行信息 */
export interface AiReplyResult {
  reply: string
  steps: unknown[]
  plans: unknown[]
  usage: {
    modelCalls: number
    toolCalls: number
    inputTokens: number | null
    outputTokens: number | null
    estimatedCost: number
    /** false 时 estimatedCost 不代表免费，只是未配置计价 */
    costConfigured: boolean
    elapsedMs: number
  }
  termination: string
  truncated: boolean
  sources?: AiReplySource[]
  verificationNotice?: string | null
}

/** 生成/查询回复的响应 */
export interface AiReply {
  message: AiMessage
  runStatus: AiRunStatus
  planStatus: AiPlanStatus
  /** 计划所依据的版本 */
  sourceVersion: number | null
  /** 确认后产出的新版本；未确认时为 null */
  outputVersion: number | null
  result: AiReplyResult | null
  changes: AiChange[]
}

// ==================== 页面预览 / 版本比较 / 兼容性验收 ====================

/**
 * 页面预览元信息（对应后端 PagePreviewInfoVO）
 * pageCount 在 DOCX/XLSX 首次渲染前可能为 null
 */
export interface VersionPreviewMeta {
  fileId: number
  versionNo: number
  /** 版本自身的 MIME 类型 */
  contentType: string | null
  /** 版本自身扩展名 */
  extension: string | null
  /** 可预览页数；不可预览为 null */
  pageCount: number | null
  /** 是否需要外部转换器（PDF、图片为 false） */
  requiresConversion: boolean
  /** 是否具备预览条件 */
  previewable: boolean
  /** 实际渲染引擎；PDF/图片为 native */
  engine: string | null
  /** 渲染 DPI */
  dpi: number
  /** 不可预览时的可读说明 */
  message: string | null
}

/** 版本比较中的单条差异类型 */
export type VersionCompareChangeType = 'ADDED' | 'REMOVED' | 'MODIFIED'

/** 版本比较中的单条差异（块或单元格粒度） */
export interface VersionCompareChange {
  type: VersionCompareChangeType
  /** 块 ID 或「工作表!单元格」 */
  key: string
  /** 可读标签 */
  label: string | null
  /** 修改/删除时的原文；新增为 null */
  before: string | null
  /** 修改/新增时的新文；删除为 null */
  after: string | null
  /** 内容种类：段落 / 表格单元格等 */
  kind: string | null
}

/** 版本比较结果（对应后端 VersionComparisonVO） */
export interface VersionCompareResult {
  fileId: number
  fromVersion: number
  toVersion: number
  format: string
  /** true 表示结构读取有上限，changes 不完整 */
  truncated: boolean
  changes: VersionCompareChange[]
}

/** 兼容性问题的严重级别；只有 ERROR 会使 compatible=false */
export type CompatibilitySeverity = 'ERROR' | 'WARNING'

/** 兼容性验收中的单条问题 */
export interface CompatibilityIssue {
  severity: CompatibilitySeverity
  /** NO_PAGES / NO_RENDERED_PAGE / PAGES_TRUNCATED / MISSING_FONTS / CONTENT_NEAR_BORDER */
  code: string
  message: string
}

/** 兼容性验收报告（对应后端 DocxCompatibilityReportVO） */
export interface CompatibilityReport {
  fileId: number
  versionNo: number
  compatible: boolean
  engine: string | null
  pageCount: number
  renderedPages: number
  missingFonts: string[]
  issues: CompatibilityIssue[]
}

// ==================== DOCX 内容编辑（API.md 4.4 ～ 4.11）====================

/**
 * 块 ID 规则（后端校验，来自各 DTO 的 @Pattern）：
 * - 正文段落：`body/p1`
 * - 表格单元格内段落：`body/t0/r1/c0/p2`
 * - 页眉页脚段落：`header1/p1`、`footer1/p1`
 * 块 ID 只在单一版本内稳定；编辑产生新版本后必须重新读取结构。
 */

/** 替换段落文本的单个操作 */
export interface DocxParagraphTextOperation {
  /** 目标段落块 ID */
  blockId: string
  /** 替换后的文本；允许空字符串清空段落，不允许省略 */
  text: string
}

/** 替换段落文本请求（4.4） */
export interface ReplaceDocxTextParams {
  /** 编辑说明，最长 2000 */
  instruction?: string
  /** 1～100 个操作 */
  operations: DocxParagraphTextOperation[]
}

/** 段落编辑操作类型 */
export type DocxParagraphEditType = 'INSERT_BEFORE' | 'INSERT_AFTER' | 'DELETE'

/** 插入或删除段落的单个操作 */
export interface DocxParagraphEditOperation {
  type: DocxParagraphEditType
  blockId: string
  /** 插入操作必填；DELETE 操作必须不传 */
  text?: string
}

/** 插入或删除段落请求（4.5） */
export interface EditDocxParagraphsParams {
  instruction?: string
  operations: DocxParagraphEditOperation[]
}

/** 表格编辑操作类型 */
export type DocxTableEditType =
  | 'SET_CELL_TEXT'
  | 'INSERT_ROW_BEFORE'
  | 'INSERT_ROW_AFTER'
  | 'DELETE_ROW'
  | 'SET_ROW_HEIGHT'
  | 'REPEAT_HEADER_ROW'
  | 'SET_COLUMN_WIDTH'
  | 'MERGE_CELLS'
  | 'SPLIT_CELL'

/** 表格编辑的单个操作 */
export interface DocxTableEditOperation {
  type: DocxTableEditType
  /** 单元格操作指向 CELL，行操作指向 ROW，最长 512 */
  blockId: string
  /** MERGE_CELLS 的矩形右下单元格；SPLIT_CELL 不使用 */
  endBlockId?: string
  /** SET_CELL_TEXT 使用，允许空字符串清空单元格 */
  text?: string
  /** 插入行使用；元素数量必须与参照行列数一致，最多 100 个 */
  values?: string[]
  /** SET_COLUMN_WIDTH / SET_ROW_HEIGHT 使用，单位 twips，1～20000 */
  dimensionTwips?: number
  /** REPEAT_HEADER_ROW 使用 */
  repeatHeader?: boolean
}

/** 编辑表格请求（4.6） */
export interface EditDocxTableParams {
  instruction?: string
  operations: DocxTableEditOperation[]
}

/** 段落格式操作类型 */
export type DocxParagraphFormatType =
  | 'SET_HEADING'
  | 'SET_NORMAL'
  | 'SET_BULLET'
  | 'SET_NUMBERED'
  | 'CLEAR_LIST'
  | 'SET_PAGE_BREAK_BEFORE'
  | 'CLEAR_PAGE_BREAK_BEFORE'

/** 段落格式的单个操作 */
export interface DocxParagraphFormatOperation {
  type: DocxParagraphFormatType
  /** 必须指向正文或表格单元格中的段落 */
  blockId: string
  /** 仅 SET_HEADING 使用，1～9 级 */
  level?: number
}

/** 设置段落格式请求（4.7） */
export interface FormatDocxParagraphsParams {
  instruction?: string
  operations: DocxParagraphFormatOperation[]
}

/** 插入内嵌图片的单个操作 */
export interface DocxInlineImageOperation {
  /** 目标段落块 ID */
  blockId: string
  /** 图片文件 ID */
  imageFileId: number
  /** 图片版本号（必须明确指定） */
  imageVersionNo: number
  /** 宽度像素，1～10000 */
  widthPixels: number
  /** 高度像素，1～10000 */
  heightPixels: number
}

/** 插入内嵌图片请求（4.8），单次最多 20 张 */
export interface InsertDocxImagesParams {
  instruction?: string
  operations: DocxInlineImageOperation[]
}

/** 页眉页脚位置 */
export type DocxHeaderFooterLocation = 'HEADER' | 'FOOTER'

/** 页眉页脚类型 */
export type DocxHeaderFooterType = 'DEFAULT' | 'FIRST' | 'EVEN'

/** 设置分节页眉页脚链接请求（4.9） */
export interface UpdateDocxHeaderFooterLinkParams {
  /** 分节序号，1～1000 */
  sectionNo: number
  location: DocxHeaderFooterLocation
  type: DocxHeaderFooterType
  /** 是否链接到上一节 */
  linkedToPrevious: boolean
  /** 取消链接时必填；重新链接时必须不传 */
  text?: string
  instruction?: string
}

/** 单个分节的页眉页脚链接状态；第一节没有上一节，全部为 false */
export interface DocxHeaderFooterSection {
  sectionNo: number
  defaultHeaderLinked: boolean
  firstHeaderLinked: boolean
  evenHeaderLinked: boolean
  defaultFooterLinked: boolean
  firstFooterLinked: boolean
  evenFooterLinked: boolean
}

/** 页眉页脚链接状态响应（对应后端 DocxHeaderFooterLinksVO） */
export interface DocxHeaderFooterLinks {
  fileId: number
  versionNo: number
  totalSections: number
  sections: DocxHeaderFooterSection[]
}

/** 脚注操作类型 */
export type DocxFootnoteEditType = 'ADD' | 'UPDATE' | 'DELETE'

/** 脚注的单个操作 */
export interface DocxFootnoteEditOperation {
  type: DocxFootnoteEditType
  /** ADD 必填，必须是正文或表格单元格中的段落 */
  targetBlockId?: string
  /** UPDATE / DELETE 必填 */
  footnoteId?: number
  /** ADD / UPDATE 必填，DELETE 不传 */
  text?: string
}

/** 编辑脚注请求（4.10），单次最多 50 个操作 */
export interface EditDocxFootnotesParams {
  instruction?: string
  operations: DocxFootnoteEditOperation[]
}

/** 被正文引用且可安全识别的脚注 */
export interface DocxFootnote {
  id: number
  text: string
  /** 引用该脚注的段落块 ID 列表 */
  referencedBy: string[]
}

/** 脚注查询响应（对应后端 DocxFootnotesVO） */
export interface DocxFootnotes {
  fileId: number
  versionNo: number
  footnotes: DocxFootnote[]
}

/** 目录插入位置 */
export type DocxTocPosition = 'START' | 'END'

/** 插入或刷新目录域的请求（4.11）；后端各字段均有默认值，可全部省略 */
export interface CreateDocxTableOfContentsParams {
  /** 默认 END */
  position?: DocxTocPosition
  /** 目录标题级别 1～9，默认 3 */
  maxLevel?: number
  /** 是否生成超链接，默认 true */
  hyperlinks?: boolean
  /** 目录标题，默认「目录」，最长 100 */
  title?: string
  instruction?: string
}

/** 目录域查询响应（对应后端 DocxTableOfContentsVO，只返回检测到的第一个 TOC 域） */
export interface DocxTableOfContents {
  fileId: number
  versionNo: number
  /** 是否存在 TOC 域 */
  present: boolean
  /** TOC 域所在块 ID；不存在时为 null */
  blockId: string | null
  /** 域指令；不存在时为 null */
  instruction: string | null
  /** 是否要求打开文档时更新域 */
  updateFieldsOnOpen: boolean
}

