import { ElMessage } from 'element-plus'
import { http } from '../api/http'

export function showError(error) {
  if (!error) return
  const suffix = error.requestId ? `（请求ID: ${error.requestId}）` : ''
  ElMessage.error(`${error.message || '服务异常，请稍后重试'}${suffix}`)
}
// Management pages retain envelope results while sharing the transport and refresh lock.
async function request(config) {
  try {
    const response = await http.request(config)
    return config.responseType === 'blob' ? response : { code: 0, data: response.data }
  } catch (error) {
    if (!config.silent) showError(error)
    throw error
  }
}
request.get = (url, config = {}) => request({ ...config, url, method: 'GET' })
request.post = (url, data, config = {}) => request({ ...config, url, data, method: 'POST' })
request.put = (url, data, config = {}) => request({ ...config, url, data, method: 'PUT' })
request.delete = (url, config = {}) => request({ ...config, url, method: 'DELETE' })
export default request
