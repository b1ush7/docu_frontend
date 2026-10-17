// Token 存取：localStorage 持久化 + 跨标签页通过 storage 事件同步
const KEY = 'wenshu_admin_tokens'

export function setTokens(data) {
  const payload = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    // expiresIn / refreshExpiresIn 单位为秒，换算为到期时间戳
    expiresAt: Date.now() + (data.expiresIn || 0) * 1000,
    refreshExpiresAt: Date.now() + (data.refreshExpiresIn || 0) * 1000,
  }
  localStorage.setItem(KEY, JSON.stringify(payload))
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

export function getAccessToken() {
  return read()?.accessToken || ''
}

export function getRefreshToken() {
  return read()?.refreshToken || ''
}

export function clearTokens() {
  localStorage.removeItem(KEY)
}

// 跨标签页同步：其他标签页清除 Token 时，本页跳转登录
export function watchTokenCleared(onCleared) {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && !e.newValue) onCleared()
  })
}
