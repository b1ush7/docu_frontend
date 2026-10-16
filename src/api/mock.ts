/**
 * @file 开发环境 Mock 适配器（仅本地预览视觉用，不参与生产构建）
 * @description 通过 VITE_USE_MOCK=1 在 main.ts 中按需动态导入并安装到 axios 实例，
 *              模拟工作台预览链路所需接口：登录用户 / 文件上传列表重命名删除 / AI_EDIT 任务
 *              创建与轮询（每次查询推进 20% 进度）/ DOCX 结构 / 取消 / 版本列表。
 *              模拟任务约 12 秒（4 次轮询）完成，便于观察"生成中 → 预览 → 确认"全流程。
 */
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { http } from './http'
import { API_ENDPOINTS } from './endpoints'
import type {
  DocBlock,
  DocxStructure,
  FileAsset,
  StepStatus,
  Task,
  TaskStep,
  UserInfo,
  Version,
} from './types'

/** 模拟网络延迟毫秒数 */
const MOCK_DELAY_MS = 400

/** 模拟文件自增 ID 起点 */
let nextFileId = 100

/** 模拟版本自增 ID 起点 */
let nextVersionId = 300

/** 模拟任务自增 ID 起点 */
let nextTaskId = 200

/** 模拟用户文件库（status 与后端软删除语义一致） */
const mockFiles: FileAsset[] = [
  {
    id: 1,
    originalName: '产品需求说明.docx',
    displayName: '产品需求说明.docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
    sizeBytes: 245_760,
    sha256: 'mock-sha-1',
    source: 'UPLOAD',
    status: 'READY',
    latestVersion: 1,
    createTime: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    updateTime: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
]

/** 模拟任务库（初始为空，由"生成文稿"动作创建） */
const mockTasks: Task[] = []

/** AI_EDIT 模拟执行步骤名称（与任务详情步骤列表一致） */
const STEP_NAMES = ['解析文档结构', '提取正文内容', 'AI 改写正文', '重建文档版式', '生成新版本']

/** 单步进度增量：5 步各 20%，4 次轮询完成 */
const STEP_INCREMENT = 20

/**
 * 构造成功响应包（与后端统一响应格式一致）
 * @param data 业务数据
 * @returns axios 响应对象
 */
function ok<T>(data: T): AxiosResponse {
  return {
    data: { code: 0, msg: '', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  }
}

/**
 * 构造业务失败响应包（HTTP 200 + 非 0 业务码，由响应拦截器转成 ApiError）
 * @param code 业务码
 * @param msg 提示信息
 * @returns axios 响应对象
 */
function fail(code: number, msg: string): AxiosResponse {
  return {
    data: { code, msg, data: null },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  }
}

/**
 * 解析请求 URL 为路径 + 查询参数（剥离 baseURL 与查询串）
 * @param config axios 请求配置
 * @returns 路径与查询参数对象
 */
function parseUrl(config: InternalAxiosRequestConfig): { path: string; query: URLSearchParams } {
  const raw = config.url ?? ''
  const url = new URL(raw, 'http://mock.local')
  return { path: url.pathname.replace(/\/+$/, ''), query: url.searchParams }
}

/**
 * 构造标题块
 * @param id 块标识
 * @param level 标题层级
 * @param text 标题文本
 * @returns 标题结构块
 */
function heading(id: string, level: number, text: string): DocBlock {
  return { blockId: id, type: 'HEADING', text, styleId: `Heading${level}`, headingLevel: level, name: null, contentType: null, sizeBytes: null, children: [] }
}

/**
 * 构造段落块
 * @param id 块标识
 * @param text 段落文本（空串表示空段）
 * @returns 段落结构块
 */
function paragraph(id: string, text: string): DocBlock {
  return { blockId: id, type: 'PARAGRAPH', text, styleId: null, headingLevel: null, name: null, contentType: null, sizeBytes: null, children: [] }
}

/**
 * 构造预览用 DOCX 结构模板：覆盖标题多级 / 段落（含空段）/ 表格 / 图片四类块
 * @param fileId 文件 ID
 * @param versionNo 版本号
 * @returns DOCX 结构
 */
function buildStructure(fileId: number, versionNo: number): DocxStructure {
  const blocks: DocBlock[] = [
    heading('body/h0', 1, '产品需求说明'),
    paragraph('body/p0', '本文档描述"文枢"智能文档工作台的核心功能需求，包括文件管理、异步任务与版本管理三大模块，供产品、设计与研发对齐使用。'),
    heading('body/h1', 2, '一、文件管理'),
    paragraph('body/p1', '用户可上传 DOCX / XLSX / PDF 等常见格式文件，系统按文档类型分类展示，并支持重命名、删除与版本历史查看。'),
    paragraph('body/p2', ''),
    {
      blockId: 'body/t0',
      type: 'TABLE',
      text: null,
      styleId: null,
      headingLevel: null,
      name: null,
      contentType: null,
      sizeBytes: null,
      children: [
        {
          blockId: 'body/t0/r0', type: 'ROW', text: null, styleId: null, headingLevel: null, name: null, contentType: null, sizeBytes: null,
          children: [cell('body/t0/r0/c0', '功能'), cell('body/t0/r0/c1', '说明')],
        },
        {
          blockId: 'body/t0/r1', type: 'ROW', text: null, styleId: null, headingLevel: null, name: null, contentType: null, sizeBytes: null,
          children: [cell('body/t0/r1/c0', 'AI 编辑'), cell('body/t0/r1/c1', '按目标要求改写正文，保留表格与图片')],
        },
        {
          blockId: 'body/t0/r2', type: 'ROW', text: null, styleId: null, headingLevel: null, name: null, contentType: null, sizeBytes: null,
          children: [cell('body/t0/r2/c0', '版本管理'), cell('body/t0/r2/c1', '每次任务成功自动落库新版本')],
        },
      ],
    },
    heading('body/h2', 2, '二、异步任务'),
    paragraph('body/p3', '耗时操作（文字识别、AI 编辑、格式转换）以异步任务执行，前端通过轮询任务详情获取进度，任务成功后可预览与确认输出。'),
    {
      blockId: 'body/img0', type: 'IMAGE', text: null, styleId: null, headingLevel: null,
      name: 'architecture.png', contentType: 'image/png', sizeBytes: 184_320, children: [],
    },
    heading('body/h3', 2, '三、版本管理'),
    paragraph('body/p4', '每次 AI 编辑成功都会产生新版本，用户可随时回溯历史版本或下载指定版本内容。本段为模拟预览数据，用于展示段落排版效果。'),
  ]
  return { fileId, versionNo, blocks }
}

/**
 * 构造单元格块（段落文本包一层 CELL）
 * @param id 单元格标识
 * @param text 单元格文本
 * @returns 单元格结构块
 */
function cell(id: string, text: string): DocBlock {
  return { blockId: id, type: 'CELL', text: null, styleId: null, headingLevel: null, name: null, contentType: null, sizeBytes: null, children: [paragraph(`${id}/p0`, text)] }
}

/**
 * 依据任务进度构造步骤列表（详情接口返回值）
 * @param task 模拟任务
 * @returns 步骤列表
 */
function buildSteps(task: Task): TaskStep[] {
  return STEP_NAMES.map((name, index) => {
    const done = (index + 1) * STEP_INCREMENT <= task.progress
    const current = !done && index * STEP_INCREMENT < task.progress
    // 步骤状态按进度推导：已走完→成功；正在走→执行中；取消→跳过；否则排队
    const status: StepStatus = task.status === 'CANCELLED'
      ? (done ? 'SUCCEEDED' : 'SKIPPED')
      : done
        ? 'SUCCEEDED'
        : current
          ? 'RUNNING'
          : 'PENDING'
    const startAt = done || current ? new Date(task.createTime).getTime() + index * 2400 : null
    return {
      stepNo: index + 1,
      stepName: name,
      status,
      detail: null,
      errorMessage: null,
      startTime: startAt !== null ? new Date(startAt).toISOString() : null,
      finishTime: done && startAt !== null ? new Date(startAt + 2200).toISOString() : null,
      durationMs: done ? 2200 : null,
    }
  })
}

/**
 * 推进任务进度：每次详情查询前进一步，走完后置为成功并落库新版本
 * @param task 模拟任务
 */
function advanceTask(task: Task): void {
  // 终态任务不再推进
  if (task.status !== 'RUNNING') {
    return
  }
  task.progress = Math.min(task.progress + STEP_INCREMENT, 100)
  // 首次推进时补记开始时间
  task.startTime = task.startTime ?? new Date().toISOString()
  if (task.progress >= 100) {
    task.status = 'SUCCEEDED'
    task.currentStep = null
    task.finishTime = new Date().toISOString()
    task.elapsedMs = 11_800
    // 成功即落库新版本：文件最新版本号 +1
    const file = mockFiles.find((f) => f.id === task.fileId)
    if (file) {
      file.latestVersion += 1
      file.updateTime = task.finishTime
      task.outputVersion = file.latestVersion
      mockVersions.unshift({
        id: nextVersionId++,
        fileId: file.id,
        versionNo: file.latestVersion,
        parentVersion: file.latestVersion - 1,
        // 新版本沿用文件当前类型（Mock 中 AI 编辑不改变格式）
        contentType: file.contentType,
        extension: file.extension,
        sizeBytes: file.sizeBytes,
        sha256: `mock-sha-v${file.latestVersion}`,
        instruction: task.instruction,
        resultSummary: `已按指令完成改写（Mock 模拟）`,
        changeType: 'AI_EDIT',
        createTime: task.finishTime,
      })
    }
  } else {
    task.currentStep = STEP_NAMES[task.progress / STEP_INCREMENT - 1] ?? null
  }
}

/** 模拟版本库（初始含上传首版，任务成功后追加） */
const mockVersions: Version[] = [
  {
    id: nextVersionId++,
    fileId: 1,
    versionNo: 1,
    parentVersion: null,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
    sizeBytes: 245_760,
    sha256: 'mock-sha-v1',
    instruction: null,
    resultSummary: null,
    changeType: 'UPLOAD',
    createTime: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
]

/**
 * 按扩展名推断文件元信息（与后端 FileAsset 字段对齐）
 * @param fileName 文件名
 * @param sizeBytes 文件大小
 * @returns 文件资产记录
 */
function buildFileAsset(fileName: string, sizeBytes: number): FileAsset {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? 'bin'
  // 按扩展名粗略映射 MIME 类型
  const mimeMap: Record<string, string> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
  }
  const now = new Date().toISOString()
  return {
    id: nextFileId++,
    originalName: fileName,
    displayName: fileName,
    contentType: mimeMap[extension] ?? 'application/octet-stream',
    extension,
    sizeBytes,
    sha256: `mock-sha-${nextFileId}`,
    source: 'UPLOAD',
    status: 'READY',
    latestVersion: 1,
    createTime: now,
    updateTime: now,
  }
}

/**
 * 安装 Mock 适配器：拦截 http 实例的全部请求并返回模拟数据
 */
export function installMockAdapter(): void {
  http.defaults.adapter = async (config) => {
    // 模拟网络延迟，观察 loading 状态
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))
    const { path, query } = parseUrl(config)
    const method = (config.method ?? 'get').toUpperCase()

    // ---------- 用户 ----------
    if (path === API_ENDPOINTS.user.me) {
      const user: UserInfo = {
        id: 1,
        username: '文枢用户',
        phone: null,
        role: 'USER',
        status: 'ENABLED',
        balance: 0,
        createTime: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        lastLoginTime: new Date().toISOString(),
      }
      return ok<UserInfo>(user)
    }

    // ---------- 文件 ----------
    if (path === API_ENDPOINTS.file.upload && method === 'POST') {
      // 从 FormData 中取上传的原始文件，读取名称与大小
      const form = config.data as FormData
      const uploaded = form?.get('file')
      const file = uploaded instanceof File ? uploaded : null
      const asset = buildFileAsset(file?.name ?? '未命名.docx', file?.size ?? 12_000)
      mockFiles.unshift(asset)
      return ok<FileAsset>(asset)
    }

    if (path === API_ENDPOINTS.file.list) {
      // 按关键字过滤（displayName 模糊匹配）后分页
      const keyword = query.get('keyword')?.trim() ?? ''
      const page = Number(query.get('page') ?? '1')
      const size = Number(query.get('size') ?? '20')
      const filtered = mockFiles
        .filter((f) => f.status === 'READY')
        .filter((f) => !keyword || f.displayName.includes(keyword))
      const start = (page - 1) * size
      return ok({
        records: filtered.slice(start, start + size),
        total: filtered.length,
        page,
        size,
        pages: Math.ceil(filtered.length / size),
      })
    }

    // /file/:id ｜ /file/:id/versions ｜ /file/:id/versions/:v/structure
    const fileMatch = path.match(/^\/file\/(\d+)(\/.*)?$/)
    if (fileMatch) {
      const file = mockFiles.find((f) => f.id === Number(fileMatch[1]) && f.status === 'READY')
      const sub = fileMatch[2] ?? ''
      // 重命名：PUT /file/{id}/name（与后端约定一致，只改展示名）
      if (file && sub === '/name' && method === 'PUT') {
        const body = JSON.parse(config.data as string) as { displayName?: string }
        if (body.displayName) {
          file.displayName = body.displayName
          file.updateTime = new Date().toISOString()
        }
        return ok<FileAsset>(file)
      }
      if (file && sub === '' && method === 'DELETE') {
        // 软删除
        file.status = 'DELETED'
        return ok(null)
      }
      const structureMatch = sub.match(/^\/versions\/(\d+)\/structure$/)
      if (file && structureMatch) {
        return ok<DocxStructure>(buildStructure(file.id, Number(structureMatch[1])))
      }
      if (file && sub === '/versions') {
        // 该文件的版本列表：接口约定直接返回数组（无分页包装），按版本号倒序
        const versions = mockVersions
          .filter((v) => v.fileId === file.id)
          .sort((a, b) => b.versionNo - a.versionNo)
          // 返回浅拷贝，避免调用方持有被后续任务推进原地修改的对象
          .map((v) => ({ ...v }))
        return ok(versions)
      }
    }

    // ---------- 任务 ----------
    if (path === API_ENDPOINTS.task.create && method === 'POST') {
      const body = JSON.parse(config.data as string) as {
        taskType: Task['taskType']
        fileId?: number
        inputVersion?: number
        instruction?: string
      }
      const task: Task = {
        id: nextTaskId++,
        fileId: body.fileId ?? null,
        taskType: body.taskType,
        status: 'RUNNING',
        progress: 0,
        currentStep: null,
        instruction: body.instruction ?? null,
        errorCode: null,
        errorMessage: null,
        inputVersion: body.inputVersion ?? null,
        outputVersion: null,
        retryCount: 0,
        maxRetry: 3,
        cancelRequested: false,
        createTime: new Date().toISOString(),
        startTime: null,
        finishTime: null,
        elapsedMs: null,
      }
      mockTasks.unshift(task)
      // 返回浅拷贝：避免同一对象被后续轮询原地修改时不触发前端响应式更新
      return ok<Task>({ ...task })
    }

    if (path === API_ENDPOINTS.task.list || /^\/task\/by-file\/\d+$/.test(path)) {
      const byFile = path.match(/^\/task\/by-file\/(\d+)$/)
      // 按文件查询：接口约定直接返回该文件全部任务数组（无分页包装）
      if (byFile) {
        return ok<Task[]>(mockTasks.filter((t) => t.fileId === Number(byFile[1])).map((t) => ({ ...t })))
      }
      const page = Number(query.get('page') ?? '1')
      const size = Number(query.get('size') ?? '20')
      const start = (page - 1) * size
      return ok({
        records: mockTasks.slice(start, start + size).map((t) => ({ ...t })),
        total: mockTasks.length,
        page,
        size,
        pages: Math.ceil(mockTasks.length / size),
      })
    }

    const taskMatch = path.match(/^\/task\/(\d+)(\/cancel)?$/)
    if (taskMatch) {
      const task = mockTasks.find((t) => t.id === Number(taskMatch[1]))
      if (!task) {
        return fail(404, '任务不存在')
      }
      if (taskMatch[2]) {
        // 取消：RUNNING 中为标记异步取消，此处直接置为已取消便于观察
        task.status = 'CANCELLED'
        task.cancelRequested = true
        task.finishTime = new Date().toISOString()
        return ok<Task>({ ...task })
      }
      // 详情查询推进模拟进度；任务主体返回浅拷贝，保证前端响应式更新
      advanceTask(task)
      return ok({ task: { ...task }, steps: buildSteps(task) })
    }

    // 其余接口未在 Mock 中实现：返回业务失败便于发现遗漏
    return fail(404, `Mock 未实现该接口：${method} ${path}`)
  }
}
