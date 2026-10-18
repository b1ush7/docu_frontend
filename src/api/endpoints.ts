/**
 * @file 接口地址统一管理
 * @description 所有后端 HTTP 接口路径集中在此登记，页面与组件禁止散落硬编码地址。
 *              路径与 API.md 保持一致；函数形式的成员用于拼接资源 ID。
 */

/** 后端接口路径集合 */
export const API_ENDPOINTS = {
  /** 用户与认证模块 */
  user: {
    /** 刷新双 Token */
    refresh: '/user/refresh',
    /** 获取当前登录用户 */
    me: '/user/me',
  },
  /** 文件模块 */
  file: {
    /** 上传文件（multipart/form-data，字段名固定为 file） */
    upload: '/file/upload',
    /** 文件分页列表 */
    list: '/file/list',
    /**
     * 文件详情 / 重命名 / 删除共用资源路径
     * @param fileId 文件 ID
     */
    detail: (fileId: number) => `/file/${fileId}`,
    /**
     * 下载文件记录对应内容（返回二进制流）
     * @param fileId 文件 ID
     */
    download: (fileId: number) => `/file/${fileId}/download`,
    /**
     * 某个文件的版本列表
     * @param fileId 文件 ID
     */
    versions: (fileId: number) => `/file/${fileId}/versions`,
    /**
     * 版本详情
     * @param fileId 文件 ID
     * @param versionNo 版本号
     */
    versionDetail: (fileId: number, versionNo: number) =>
      `/file/${fileId}/versions/${versionNo}`,
    /**
     * 下载指定版本（二进制流，使用该版本独立保存的类型与扩展名，文件名自动带版本后缀）
     * @param fileId 文件 ID
     * @param versionNo 版本号
     */
    versionDownload: (fileId: number, versionNo: number) =>
      `/file/${fileId}/versions/${versionNo}/download`,
    /**
     * 恢复历史版本（复用目标版本内容创建新的 RESTORE 版本，不覆盖历史）
     * @param fileId 文件 ID
     * @param versionNo 要恢复到的版本号
     */
    versionRestore: (fileId: number, versionNo: number) =>
      `/file/${fileId}/versions/${versionNo}/restore`,
    /**
     * 读取某个版本的 DOCX 结构（仅 DOCX 支持）
     * @param fileId 文件 ID
     * @param versionNo 版本号
     */
    structure: (fileId: number, versionNo: number) =>
      `/file/${fileId}/versions/${versionNo}/structure`,
    /**
     * 页面预览元信息（页数、是否可预览、渲染引擎、DPI）
     * @param fileId 文件 ID
     * @param versionNo 版本号
     */
    preview: (fileId: number, versionNo: number) =>
      `/file/${fileId}/versions/${versionNo}/preview`,
    /**
     * 渲染指定页为 PNG（二进制流）
     * @param fileId 文件 ID
     * @param versionNo 版本号
     * @param pageNo 页码，从 1 开始
     */
    pagePreview: (fileId: number, versionNo: number, pageNo: number) =>
      `/file/${fileId}/versions/${versionNo}/pages/${pageNo}/preview`,
    /**
     * 比较两个版本的块级差异
     * @param fileId 文件 ID
     * @param fromVersion 基准版本号
     * @param toVersion 目标版本号
     */
    compare: (fileId: number, fromVersion: number, toVersion: number) =>
      `/file/${fileId}/versions/${fromVersion}/compare/${toVersion}`,
    /**
     * 将指定版本导出为 PDF（二进制流）
     * @param fileId 文件 ID
     * @param versionNo 版本号
     */
    exportPdf: (fileId: number, versionNo: number) =>
      `/file/${fileId}/versions/${versionNo}/export/pdf`,
    /**
     * DOCX 应用级兼容性验收
     * @param fileId 文件 ID
     * @param versionNo 版本号
     */
    compatibilityCheck: (fileId: number, versionNo: number) =>
      `/file/${fileId}/versions/${versionNo}/compatibility-check`,
  },
  /** 异步任务模块 */
  task: {
    /** 提交异步任务 */
    create: '/task',
    /** 任务分页列表 */
    list: '/task/list',
    /**
     * 任务详情（含执行步骤列表）
     * @param taskId 任务 ID
     */
    detail: (taskId: number) => `/task/${taskId}`,
    /**
     * 取消任务
     * @param taskId 任务 ID
     */
    cancel: (taskId: number) => `/task/${taskId}/cancel`,
    /**
     * 重试任务（仅 FAILED / CANCELLED 可重试）
     * @param taskId 任务 ID
     */
    retry: (taskId: number) => `/task/${taskId}/retry`,
    /**
     * 查询某个文件的处理历史任务
     * @param fileId 文件 ID
     */
    byFile: (fileId: number) => `/task/by-file/${fileId}`,
  },
} as const
