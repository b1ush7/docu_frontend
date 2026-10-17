/**
 * @file auth.ts
 * @description 认证模块接口（对齐《前端联调文档》§一 认证模块）。
 *
 *              · 密码登录：POST /user/login，请求体字段为 **account**（非 username），
 *                账号可填用户名或手机号，后端按手机号正则自动识别（P1）；
 *              · 发送验证码：POST /user/login/code，响应 data 为**脱敏手机号**，
 *                不返回验证码（P1）；
 *              · 验证码登录：POST /user/login/by-code（非 /user/login/phone）；
 *              · 刷新令牌：POST /user/refresh，字段为 **refreshToken**（§0.5，
 *                此前"保留 refreshToekn 拼写"的假设已被文档证伪，予以纠正）；
 *              · 注册：POST /user/register（P2），响应 data 为 **UserInfo**，
 *                **不返回 Token**，因此注册成功不等于登录，需引导用户回登录页；
 *              · 退出登录：POST /user/logout（当前设备）、POST /user/logout-all
 *                （全部其他设备，data 为实际撤销的会话数）。
 */
import http, { type ApiResponse } from './http'
import type { TokenPair, UserInfo } from '@/types/user'

/** 密码登录请求体（P1：account 为用户名或手机号） */
export interface PasswordLoginParams {
  /** 用户名或手机号；填手机号时后端按 ^1[3-9]\d{9}$ 识别 */
  account: string
  password: string
}

/** 两种登录方式的响应 data 统一为 TokenPair（expiresIn 单位为秒） */
export type LoginResult = TokenPair

/**
 * 账号密码登录
 * POST /user/login
 * @returns data 为 TokenPair
 */
export function loginByPassword(
  params: PasswordLoginParams,
): Promise<ApiResponse<LoginResult>> {
  return http.post('/user/login', params, { _skipAuthRefresh: true })
}

/**
 * 发送登录验证码
 * POST /user/login/code
 * @description 要求手机号已注册且账号未禁用；响应 data 为脱敏手机号（如 ****0000）；
 *              开发环境验证码打印在服务端日志（[Mock 验证码] 开头），需向后端索取。
 * @returns data 为脱敏手机号字符串
 */
export function sendLoginCode(phone: string): Promise<ApiResponse<string>> {
  return http.post('/user/login/code', { phone })
}

/**
 * 验证码登录
 * POST /user/login/by-code
 * @returns data 为 TokenPair
 */
export function loginByCode(params: {
  phone: string
  code: string
}): Promise<ApiResponse<LoginResult>> {
  return http.post('/user/login/by-code', params, { _skipAuthRefresh: true })
}

/** 密码注册请求体（P2：手机号选填） */
export interface RegisterParams {
  /** 用户名：4-20 位，仅字母、数字、下划线 */
  username: string
  /** 手机号（选填）：填写时须匹配 ^1[3-9]\d{9}$，否则后端返回 400 */
  phone?: string
  /** 密码：8-64 位 */
  password: string
}

/**
 * 账号密码注册
 * POST /user/register
 * @description 手机号选填（不填则不参与校验）。响应 data 为 UserInfo，**不含 Token**，
 *              注册成功需引导用户前往登录页；错误 400：用户名已被占用 / 手机号已被注册。
 * @returns data 为新建用户的 UserInfo
 */
export function registerByPassword(
  params: RegisterParams,
): Promise<ApiResponse<UserInfo>> {
  return http.post('/user/register', params, { _skipAuthRefresh: true })
}

/** 验证码注册请求体（P2：手机号必填） */
export interface RegisterByCodeParams {
  /** 用户名：4-20 位，仅字母、数字、下划线 */
  username: string
  /** 手机号（必填）：须匹配 ^1[3-9]\d{9}$ */
  phone: string
  /** 短信验证码 */
  code: string
  /** 密码：8-64 位 */
  password: string
}

/**
 * 发送注册验证码
 * POST /user/register/code
 * @description 要求手机号**未注册**；响应 data 为脱敏手机号，不返回验证码
 *              （开发环境验证码见服务端日志，[Mock 验证码] 开头）。
 * @returns data 为脱敏手机号字符串
 */
export function sendRegisterCode(phone: string): Promise<ApiResponse<string>> {
  return http.post('/user/register/code', { phone })
}

/**
 * 验证码注册
 * POST /user/register/by-code
 * @description 响应 data 为 UserInfo，**不含 Token**，注册成功需引导用户前往登录页。
 * @returns data 为新建用户的 UserInfo
 */
export function registerByCode(
  params: RegisterByCodeParams,
): Promise<ApiResponse<UserInfo>> {
  return http.post('/user/register/by-code', params, { _skipAuthRefresh: true })
}

/** 找回密码：重设密码请求体（P3） */
export interface ResetPasswordParams {
  /** 手机号（必填）：须匹配 ^1[3-9]\d{9}$，且为已注册、未禁用的账号 */
  phone: string
  /** 短信验证码 */
  code: string
  /** 新密码：文档 P3 未另列长度规则，沿用 P2 注册密码的 8-64 位校验 */
  newPassword: string
}

/**
 * 发送找回密码验证码
 * POST /user/reset-password/code
 * @description 要求手机号**已注册且账号未禁用**；响应 data 为脱敏手机号，不返回验证码
 *              （开发环境验证码见服务端日志，[Mock 验证码] 开头）。
 * @returns data 为脱敏手机号字符串
 */
export function sendResetCode(phone: string): Promise<ApiResponse<string>> {
  return http.post('/user/reset-password/code', { phone })
}

/**
 * 重设密码
 * POST /user/reset-password
 * @description 响应 data 为 null、msg 为「密码已重置，请使用新密码登录」。
 *              **成功后服务端会撤销该用户的全部会话**，前端必须清空本地 Token 并跳登录页。
 */
export function resetPassword(params: ResetPasswordParams): Promise<ApiResponse<null>> {
  return http.post('/user/reset-password', params, { _skipAuthRefresh: true })
}

/**
 * 刷新访问令牌
 * POST /user/refresh
 * @description 字段为 refreshToken（§0.5）。刷新返回新的双 Token，旧 Refresh 立即失效。
 *              正常情况下该请求由 http.ts 的 401 拦截器内部调度，业务代码无需直接调用。
 */
export function refreshToken(refreshToken: string): Promise<ApiResponse<TokenPair>> {
  return http.post('/user/refresh', { refreshToken }, { _skipAuthRefresh: true })
}

/** 修改密码请求体（P4，需登录） */
export interface ChangePasswordParams {
  /** 旧密码（必填） */
  oldPassword: string
  /** 新密码：8-64 位 */
  newPassword: string
}

/**
 * 修改密码
 * POST /user/change-password（P4，需登录）
 * @description oldPassword 必填；newPassword 必填且 8-64 位。
 *              **成功后服务端撤销包括当前设备在内的全部会话**，前端收到成功响应后
 *              必须清空本地 Token 并跳转登录页。错误：400 原密码不正确；401 未登录。
 *              需登录接口不设 _skipAuthRefresh：401 时走统一 Token 刷新流程。
 */
export function changePassword(
  params: ChangePasswordParams,
): Promise<ApiResponse<null>> {
  return http.post('/user/change-password', params)
}

/**
 * 获取当前登录用户信息
 * GET /user/me
 */
export function getCurrentUser(): Promise<ApiResponse<UserInfo>> {
  return http.get('/user/me')
}

/**
 * 退出当前设备
 * POST /user/logout
 * @description 请求体为空。当前成功响应 msg 为空，提示文字位于 data（如「登出成功」）。
 */
export function logout(): Promise<ApiResponse<string>> {
  return http.post('/user/logout', null, { _skipAuthRefresh: true })
}

/**
 * 退出全部其他设备
 * POST /user/logout-all
 * @returns data 为实际撤销的会话数量（当前设备保持登录）
 */
export function logoutAll(): Promise<ApiResponse<number>> {
  return http.post('/user/logout-all', null, { _skipAuthRefresh: true })
}
