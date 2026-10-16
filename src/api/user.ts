/**
 * @file 用户模块 API
 * @description 封装 GET /user/me 等用户信息接口；登出接口由认证流程使用，暂集中于此。
 */
import { getData } from './http'
import { API_ENDPOINTS } from './endpoints'
import type { UserInfo } from './types'

/** 用户模块 API 集合 */
export const userApi = {
  /**
   * 获取当前登录用户信息
   * @returns 当前用户 UserInfo
   */
  me(): Promise<UserInfo> {
    return getData<UserInfo>(API_ENDPOINTS.user.me)
  },
}
