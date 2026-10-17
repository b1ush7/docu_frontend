// Token 存取：与 stores/user.ts 共用 'wenshu.auth' 持久化结构
// 结构：{ tokens: TokenPair, user: UserInfo | null }
// TokenPair: { accessToken, refreshToken, expiresIn, refreshExpiresIn }（expiresIn 单位为秒）
const KEY = 'wenshu.auth'

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

// data 为后端返回的 TokenPair（登录 / 刷新接口的 data）
export function setTokens(data) {
  const current = read() || { user: null }
  current.tokens = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    refreshExpiresIn: data.refreshExpiresIn,
  }
  localStorage.setItem(KEY, JSON.stringify(current))
}

export function getAccessToken() {
  return read()?.tokens?.accessToken || ''
}

export function getRefreshToken() {
  return read()?.tokens?.refreshToken || ''
}

export function clearTokens() {
  localStorage.removeItem(KEY)
}

// 跨标签页同步：其他标签页清除凭证时，本页跳转登录
export function watchTokenCleared(onCleared) {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && !e.newValue) onCleared()
  })
}
