/**
 * @file validate.ts
 * @description 表单校验工具：手机号 / 用户名正则与登录、注册两种场景的密码规则，
 *              及对应错误文案。
 *
 *              规则来源：《前端联调文档》
 *                · P1 登录页：手机号 /^1[3-9]\d{9}$/；登录密码仅要求**非空**
 *                · P2 注册页：用户名 4-20 位仅字母数字下划线；密码 8-64 位；
 *                  手机号**选填**，填了才校验格式
 *
 *              统一在此维护，供验证码组件、密码表单、验证码表单、注册表单复用，
 *              避免正则散落在各组件中。禁止 any。
 */

/** 手机号正则：1 开头、第二位 3~9、共 11 位数字 */
export const PHONE_REGEX = /^1[3-9]\d{9}$/

/** 用户名正则：4-20 位，仅字母、数字、下划线（文档 P2） */
export const USERNAME_REGEX = /^[A-Za-z0-9_]{4,20}$/

/** 注册密码长度区间（文档 P2） */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 64

/** 验证码位数区间（API 文档 §2.3/§2.6/§2.8：验证码为 4~8 位数字） */
export const CODE_MIN_LENGTH = 4
export const CODE_MAX_LENGTH = 8

/** 手机号校验失败文案（用于页面内联错误提示） */
export const PHONE_ERROR_MESSAGE = '请输入正确的手机号'
/** 用户名为空时的文案 */
export const USERNAME_REQUIRED_MESSAGE = '请输入用户名'
/** 用户名格式不符时的文案 */
export const USERNAME_ERROR_MESSAGE = '用户名需 4-20 位，仅字母、数字或下划线'
/** 登录密码为空时的文案 */
export const PASSWORD_REQUIRED_MESSAGE = '请输入密码'
/** 修改密码页旧密码为空时的文案 */
export const OLD_PASSWORD_REQUIRED_MESSAGE = '请输入旧密码'
/** 修改密码页新密码为空时的文案 */
export const NEW_PASSWORD_REQUIRED_MESSAGE = '请输入新密码'
/** 注册密码长度不符时的文案 */
export const PASSWORD_LENGTH_ERROR_MESSAGE = '密码需 8-64 位'
/** 验证码位数不符时的文案 */
export const CODE_ERROR_MESSAGE = '请输入 4-8 位验证码'

/**
 * 校验手机号是否合法
 * @param phone 待校验字符串（调用方需先 trim）
 * @returns 合法返回 true；空串或格式不符返回 false
 */
export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone)
}

/**
 * 校验用户名是否合法（注册场景）
 * @param username 待校验字符串（调用方需先 trim）
 * @returns 4-20 位且仅含字母 / 数字 / 下划线返回 true
 */
export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username)
}

/**
 * 校验登录密码是否可提交
 * @description 登录页只要求非空（文档 P1）；更严格的长度规则属于注册页（P2），不在此处施加。
 * @param password 待校验密码明文
 * @returns 非空返回 true
 */
export function isPasswordValid(password: string): boolean {
  return password.length > 0
}

/**
 * 校验注册密码是否合法（文档 P2：8-64 位）
 * @param password 待校验密码明文
 * @returns 长度在 8~64 之间返回 true
 */
export function isValidRegisterPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH
  )
}

/**
 * 校验验证码位数是否合法（API 文档：4~8 位数字）
 * @description 输入层已由 CaptchaInput 过滤非数字，此处仅校验位数区间。
 * @param code 待校验验证码字符串
 * @returns 位数在 4~8 之间返回 true
 */
export function isValidCaptchaCode(code: string): boolean {
  return /^\d{4,8}$/.test(code)
}
