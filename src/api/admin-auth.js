import request from '../utils/request'

// 登录：成功判定看 code===0；返回 {accessToken, refreshToken, expiresIn, refreshExpiresIn}
export function login(data, config = {}) {
  return request.post('/user/login', data, { ...config, _skipAuthRefresh: true })
}

export function fetchMe(config = {}) {
  return request.get('/user/me', config)
}

export function changePassword(data) {
  return request.post('/user/change-password', data)
}

export function logout() {
  return request.post('/user/logout')
}

// 退出全部其他设备，返回实际撤销会话数
export function logoutAll() {
  return request.post('/user/logout-all')
}
