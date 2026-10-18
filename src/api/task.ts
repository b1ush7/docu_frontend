/**
 * @file 异步任务模块接口
 * @description 任务提交、分页列表、详情（含步骤）、取消、重试与按文件查询历史。
 *              后端无 SSE 推送，任务进行中需要由前端轮询任务详情刷新状态。
 */

import { API_ENDPOINTS } from './endpoints'
import { getData, postData } from './http'
import type { PageResult, Task, TaskCreateParams, TaskDetail, TaskListParams } from './types'

/** 异步任务模块 API 集合 */
export const taskApi = {
  /**
   * 提交异步任务
   * @param params 任务类型、文件 ID、指令等参数
   * @returns 新建的任务记录（初始状态通常为 PENDING）
   *
   * 注意：`taskType` 只能是 `CONVERT` 或 `EXPORT`（后端 `CreateTaskDTO` 校验
   * `^(CONVERT|EXPORT)$`）。`OCR`、`AI_EDIT`、`IMAGE_GEN` 仅作为历史任务的查询取值，
   * 新建时会被后端以 400 拒绝；OCR 与 AI 编辑请走各自的同步接口（见 api/ai.ts）。
   */
  create(params: TaskCreateParams): Promise<Task> {
    return postData<Task>(API_ENDPOINTS.task.create, params)
  },

  /**
   * 分页获取当前用户任务列表，按创建时间倒序
   * @param params 分页 / 状态 / 类型 / 文件过滤参数
   * @returns 分页结果
   */
  list(params?: TaskListParams): Promise<PageResult<Task>> {
    return getData<PageResult<Task>>(API_ENDPOINTS.task.list, { params })
  },

  /**
   * 获取任务详情（任务主体 + 全部执行步骤），轮询刷新任务状态时调用
   * @param taskId 任务 ID
   * @returns 任务详情
   */
  detail(taskId: number): Promise<TaskDetail> {
    return getData<TaskDetail>(API_ENDPOINTS.task.detail(taskId))
  },

  /**
   * 取消任务：PENDING 直接取消；RUNNING 设置取消标记，由执行器在步骤边界生效；
   * 终态任务重复取消直接返回当前状态。
   * @param taskId 任务 ID
   * @returns 取消后的任务记录
   */
  cancel(taskId: number): Promise<Task> {
    return postData<Task>(API_ENDPOINTS.task.cancel(taskId))
  },

  /**
   * 重试任务：仅 FAILED / CANCELLED 可重试，会创建新的任务记录
   * @param taskId 任务 ID
   * @returns 新创建的重试任务
   */
  retry(taskId: number): Promise<Task> {
    return postData<Task>(API_ENDPOINTS.task.retry(taskId))
  },

  /**
   * 查询某个文件的处理历史任务，按创建时间倒序（用于选中文件后刷新任务列表）
   * @param fileId 文件 ID
   * @returns 该文件关联的任务数组
   */
  listByFile(fileId: number): Promise<Task[]> {
    return getData<Task[]>(API_ENDPOINTS.task.byFile(fileId))
  },
}
