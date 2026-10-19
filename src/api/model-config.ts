/**
 * @file 模型配置接口（管理员）
 * @description 对应 API.md 第 7 章的 /admin/model-configs 系列。
 *
 * 三条必须记住的语义（均来自后端实现）：
 *   1. **密钥只写不读**：`apiKey` 只在写入时接收，服务端用 AES-256-GCM 加密后落库；
 *      出参只有 `apiKeyConfigured` 与 `apiKeyMasked`，永远不会回读明文。
 *      更新时 `apiKey` 留空表示「保持原有密钥不变」，不是清空。
 *   2. **新建默认停用**：创建后状态固定为 DISABLED，需再调 setStatus 启用；
 *      未配置密钥时启用会返回 409。
 *   3. **默认配置禁止删除**：需先把另一条设为默认，删除返回 409。
 *
 * 另外：当前后端的模型接入走的是 `res.ai.*` 环境变量（AiModelProperties），
 * 这套表驱动配置是为「多模型路由」预留的，改了不一定影响线上对话能力。
 */

import { API_ENDPOINTS } from './endpoints'
import { deleteData, getData, postData, putData } from './http'
import type {
  ModelConfig,
  ModelConfigQueryParams,
  PageResult,
  SaveModelConfigParams,
  UpdateModelConfigStatusParams,
} from './types'

/** 模型配置管理 API */
export const adminModelConfigApi = {
  /**
   * 模型配置分页列表（密钥仅返回掩码）
   * @param params 分页 / 用途 / 状态 / 关键字
   */
  list(params?: ModelConfigQueryParams): Promise<PageResult<ModelConfig>> {
    return getData<PageResult<ModelConfig>>(API_ENDPOINTS.admin.modelConfigs, { params })
  },

  /**
   * 模型配置详情
   * @param id 配置 ID
   */
  detail(id: number): Promise<ModelConfig> {
    return getData<ModelConfig>(API_ENDPOINTS.admin.modelConfigDetail(id))
  },

  /**
   * 新建模型配置（初始状态固定为 DISABLED）
   * @param params 配置内容，含明文 apiKey
   */
  create(params: SaveModelConfigParams): Promise<ModelConfig> {
    return postData<ModelConfig>(API_ENDPOINTS.admin.modelConfigCreate, params)
  },

  /**
   * 更新模型配置
   * @param id 配置 ID
   * @param params 配置内容；`apiKey` 留空表示保持原密钥不变
   */
  update(id: number, params: SaveModelConfigParams): Promise<ModelConfig> {
    return putData<ModelConfig>(API_ENDPOINTS.admin.modelConfigUpdate(id), params)
  },

  /**
   * 删除模型配置（默认配置禁止删除，返回 409）
   * @param id 配置 ID
   */
  remove(id: number): Promise<null> {
    return deleteData<null>(API_ENDPOINTS.admin.modelConfigDelete(id))
  },

  /**
   * 启用或停用模型配置；未配置密钥时启用返回 409
   * @param id 配置 ID
   * @param status ENABLED / DISABLED
   */
  setStatus(id: number, status: UpdateModelConfigStatusParams['status']): Promise<ModelConfig> {
    const body: UpdateModelConfigStatusParams = { status }
    return putData<ModelConfig>(API_ENDPOINTS.admin.modelConfigStatus(id), body)
  },
}
