/**
 * @file AI 会话与待确认编辑接口（对应 API.md 附录 A.1 与第 8 节）
 * @description 会话按用户隔离，访问他人会话统一返回 404。
 *              回复生成后需要用户确认才会落版本；确认与放弃都只能基于已保存的回复。
 */

import { deleteData, getData, postData } from './http'
import type {
  AiReply,
  AiSession,
  AiSessionListParams,
  AiReplyRequest,
  AiMessage,
  PageResult,
} from './types'

/** AI 会话与回复 API */
export const aiApi = {
  /**
   * 会话分页列表
   * @param params 分页 / 状态 / 文件 / 关键字过滤
   */
  listSessions(params?: AiSessionListParams): Promise<PageResult<AiSession>> {
    return getData<PageResult<AiSession>>('/ai/sessions', { params })
  },

  /**
   * 新建会话
   * @param body title 可选；fileId 可选，指定时会校验文件归属
   */
  createSession(body: { title?: string; fileId?: number }): Promise<AiSession> {
    return postData<AiSession>('/ai/sessions', body)
  },

  /** 会话详情 */
  getSession(sessionId: number): Promise<AiSession> {
    return getData<AiSession>(`/ai/sessions/${sessionId}`)
  },

  /** 归档会话；归档后追加消息返回 409 */
  archiveSession(sessionId: number): Promise<AiSession> {
    return postData<AiSession>(`/ai/sessions/${sessionId}/archive`)
  },

  /** 删除会话及其消息 */
  deleteSession(sessionId: number): Promise<null> {
    return deleteData<null>(`/ai/sessions/${sessionId}`)
  },

  /**
   * 会话消息列表（按时间正序）
   * role 取值 USER / ASSISTANT / TOOL / SYSTEM
   */
  listMessages(sessionId: number): Promise<AiMessage[]> {
    return getData<AiMessage[]>(`/ai/sessions/${sessionId}/messages`)
  },

  /**
   * 追加一条用户消息（**只落库，不生成回复**）
   * 生成回复请使用 generateReply。
   */
  appendMessage(sessionId: number, content: string): Promise<AiMessage> {
    return postData<AiMessage>(`/ai/sessions/${sessionId}/messages`, { content })
  },

  /**
   * 生成回复（同步）。绑定文件时 versionNo 必填且必须是明确版本；idempotencyKey 必填。
   * 返回后需检查 runStatus / planStatus：HTTP 成功不代表模型执行成功。
   */
  generateReply(sessionId: number, body: AiReplyRequest): Promise<AiReply> {
    return postData<AiReply>(`/ai/sessions/${sessionId}/replies`, body, { timeout: 180000 })
  },

  /** 查询回复进度与待确认修改（runStatus=RUNNING 时可重复查询） */
  getReply(sessionId: number, messageId: number): Promise<AiReply> {
    return getData<AiReply>(`/ai/sessions/${sessionId}/replies/${messageId}`)
  },

  /** 确认待确认计划：服务端按已保存回复执行，成功后产出新版本 */
  confirmReply(sessionId: number, messageId: number): Promise<AiReply> {
    return postData<AiReply>(`/ai/sessions/${sessionId}/replies/${messageId}/confirm`, undefined, { timeout: 120000 })
  },

  /** 放弃待确认计划：不生成版本；重复放弃幂等 */
  discardReply(sessionId: number, messageId: number): Promise<AiReply> {
    return postData<AiReply>(`/ai/sessions/${sessionId}/replies/${messageId}/discard`)
  },
}
