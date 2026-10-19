/**
 * @file 公共模板接口（公开只读 + 管理员维护）
 * @description 对应 API.md 第 3.1 节的公开模板列表，以及 7.12 / 7.13 的管理员模板管理。
 *
 * 两类接口的区别：
 *   - `GET /templates` 公开只读，只返回**已启用**模板，供生成文档时选模板；
 *   - `/admin/templates/**` 需要管理员，可建、改、删、启停、换文件、查历史版本、恢复。
 *
 * 注意 versionNo 的语义：替换文件或恢复历史版本才会递增，**修改元数据不递增**。
 * 模板文件通过 multipart 的 `file` 字段提交，元数据作为同表单的普通字段。
 */

import { API_ENDPOINTS } from './endpoints'
import { deleteData, getBlob, getData, postData, putData } from './http'
import type {
  DocTemplate,
  DocTemplateQueryParams,
  DocTemplateVersion,
  PageResult,
  SaveDocTemplateParams,
  TemplateVersionQueryParams,
} from './types'

/** 公共模板（只读）API */
export const templateApi = {
  /**
   * 获取可生成的已启用 DOCX 模板及变量定义
   * @returns 模板列表（不分页）
   */
  list(): Promise<DocTemplate[]> {
    return getData<DocTemplate[]>(API_ENDPOINTS.template.list)
  },
}

/** 管理员模板维护 API */
export const adminTemplateApi = {
  /**
   * 模板分页列表（含未启用）
   * @param params 分页 / 启用状态 / 分类 / 关键字
   */
  list(params?: DocTemplateQueryParams): Promise<PageResult<DocTemplate>> {
    return getData<PageResult<DocTemplate>>(API_ENDPOINTS.admin.templates, { params })
  },

  /**
   * 模板详情
   * @param id 模板 ID
   */
  detail(id: number): Promise<DocTemplate> {
    return getData<DocTemplate>(API_ENDPOINTS.admin.templateDetail(id))
  },

  /**
   * 新建模板：元数据与模板文件一起以 multipart 提交
   * @param params 元数据
   * @param file DOCX 模板文件
   */
  create(params: SaveDocTemplateParams, file: File): Promise<DocTemplate> {
    const form = new FormData()
    // 后端用 @ModelAttribute 绑定，字段名与 DTO 属性一一对应
    form.append('code', params.code)
    form.append('name', params.name)
    if (params.category !== undefined) form.append('category', params.category)
    if (params.description !== undefined) form.append('description', params.description)
    if (params.variables !== undefined) form.append('variables', params.variables)
    form.append('file', file)
    return postData<DocTemplate>(API_ENDPOINTS.admin.templateCreate, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /**
   * 更新模板元数据（不改变内容版本号）
   * @param id 模板 ID
   * @param params 元数据
   */
  update(id: number, params: SaveDocTemplateParams): Promise<DocTemplate> {
    return putData<DocTemplate>(API_ENDPOINTS.admin.templateUpdate(id), params)
  },

  /**
   * 删除模板
   * @param id 模板 ID
   */
  remove(id: number): Promise<null> {
    return deleteData<null>(API_ENDPOINTS.admin.templateDelete(id))
  },

  /**
   * 启用或停用模板
   * @param id 模板 ID
   * @param enabled true 启用、false 停用
   */
  setEnabled(id: number, enabled: boolean): Promise<DocTemplate> {
    // 后端是 @RequestParam("enabled")，因此走 query 参数而不是请求体
    return putData<DocTemplate>(API_ENDPOINTS.admin.templateEnabled(id), undefined, {
      params: { enabled },
    })
  },

  /**
   * 替换模板文件内容（内容版本号递增）
   * @param id 模板 ID
   * @param file 新的 DOCX 模板文件
   */
  replaceContent(id: number, file: File): Promise<DocTemplate> {
    const form = new FormData()
    form.append('file', file)
    return postData<DocTemplate>(API_ENDPOINTS.admin.templateContent(id), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /**
   * 下载模板当前文件
   * @param id 模板 ID
   */
  download(id: number): Promise<Blob> {
    return getBlob(API_ENDPOINTS.admin.templateDownload(id))
  },

  /**
   * 模板内容版本分页列表
   * @param id 模板 ID
   * @param params 分页参数
   */
  listVersions(
    id: number,
    params?: TemplateVersionQueryParams,
  ): Promise<PageResult<DocTemplateVersion>> {
    return getData<PageResult<DocTemplateVersion>>(API_ENDPOINTS.admin.templateVersions(id), {
      params,
    })
  },

  /**
   * 下载模板指定内容版本
   * @param id 模板 ID
   * @param versionNo 版本号
   */
  downloadVersion(id: number, versionNo: number): Promise<Blob> {
    return getBlob(API_ENDPOINTS.admin.templateVersionDownload(id, versionNo))
  },

  /**
   * 恢复到某个内容版本（会创建新的内容版本，不覆盖历史）
   * @param id 模板 ID
   * @param versionNo 要恢复到的版本号
   * @param expectVersion 客户端认为的当前内容版本号，用于乐观锁
   */
  restoreVersion(id: number, versionNo: number, expectVersion: number): Promise<DocTemplate> {
    // 后端是 @RequestParam Integer expectVersion，走 query 参数
    return postData<DocTemplate>(
      API_ENDPOINTS.admin.templateVersionRestore(id, versionNo),
      undefined,
      { params: { expectVersion } },
    )
  },
}
