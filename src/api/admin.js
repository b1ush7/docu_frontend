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
