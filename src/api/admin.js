import request from '../utils/request'

// ============ 概览统计 ============
export function getOverview(config = {}) {
  return request.get('/admin/statistics/overview', config)
}

// ============ 用户管理 ============
export function getUsers(params) {
  return request.get('/admin/users', { params })
}

export function getUserDetail(userId) {
  return request.get(`/admin/users/${userId}`)
}

export function getUserUsage(userId) {
  return request.get(`/admin/users/${userId}/usage`)
}

export function updateUserStatus(userId, status) {
  return request.put(`/admin/users/${userId}/status`, { status })
}

export function updateUserRole(userId, role) {
  return request.put(`/admin/users/${userId}/role`, { role })
}

// ============ 文件管理 ============
export function getFiles(params) {
  return request.get('/admin/files', { params })
}

export function getFileDetail(fileId) {
  return request.get(`/admin/files/${fileId}`)
}

export function renameFile(fileId, displayName) {
  return request.put(`/admin/files/${fileId}/name`, { displayName })
}

export function deleteFile(fileId) {
  return request.delete(`/admin/files/${fileId}`)
}

export function downloadFile(fileId) {
  return request.get(`/admin/files/${fileId}/download`, { responseType: 'blob' })
}

// ============ 任务管理 ============
export function getTasks(params, config = {}) {
  return request.get('/admin/tasks', { params, ...config })
}

export function getTaskDetail(taskId, config = {}) {
  return request.get(`/admin/tasks/${taskId}`, config)
}

export function cancelTask(taskId) {
  return request.post(`/admin/tasks/${taskId}/cancel`)
}

export function retryTask(taskId) {
  return request.post(`/admin/tasks/${taskId}/retry`)
}

// ============ 模型配置 ============
export function getModelConfigs(params) {
  return request.get('/admin/model-configs', { params })
}

export function getModelConfigDetail(id) {
  return request.get(`/admin/model-configs/${id}`)
}

export function createModelConfig(data) {
  return request.post('/admin/model-configs', data)
}

export function updateModelConfig(id, data) {
  return request.put(`/admin/model-configs/${id}`, data)
}

export function updateModelConfigStatus(id, status) {
  return request.put(`/admin/model-configs/${id}/status`, { status })
}

export function deleteModelConfig(id) {
  return request.delete(`/admin/model-configs/${id}`)
}

// ============ 模板管理 ============
export function getTemplates(params) {
  return request.get('/admin/templates', { params })
}

export function getTemplateDetail(id) {
  return request.get(`/admin/templates/${id}`)
}

// 新增：multipart，元数据字段 + file
export function createTemplate(formData) {
  return request.post('/admin/templates', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

// 编辑元数据：JSON，不含文件
export function updateTemplate(id, data) {
  return request.put(`/admin/templates/${id}`, data)
}

// 替换内容：multipart，仅 file
export function replaceTemplateContent(id, formData) {
  return request.post(`/admin/templates/${id}/content`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

export function setTemplateEnabled(id, enabled) {
  return request.put(`/admin/templates/${id}/enabled`, null, { params: { enabled } })
}

export function deleteTemplate(id) {
  return request.delete(`/admin/templates/${id}`)
}

export function downloadTemplate(id) {
  return request.get(`/admin/templates/${id}/download`, { responseType: 'blob' })
}

// 从 blob 响应触发浏览器下载
export function triggerBlobDownload(response, fallbackName = 'download') {
  const blob = new Blob([response.data], { type: response.headers['content-type'] })
  const disposition = response.headers['content-disposition'] || ''
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  const filename = match ? decodeURIComponent(match[1]) : fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
