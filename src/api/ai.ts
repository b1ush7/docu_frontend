/**
 * @file AI 会话与待确认编辑接口（对应 API.md 附录 A.1 与第 8 节）
 * @description 会话按用户隔离，访问他人会话统一返回 404。
 *              回复生成后需要用户确认才会落版本；确认与放弃都只能基于已保存的回复。
 */

import { createSseParser } from '@/utils/sse'
import { API_ENDPOINTS } from './endpoints'
import { deleteData, getData, http, postData } from './http'
import type {
  AiReply,
  AiSession,
  AiSessionListParams,
  AiReplyRequest,
  AiMessage,
  PageResult,
} from './types'

/** SSE 流式回复事件 */
export type AiStreamEvent =
  | { event: 'started'; replyId: number }
  | { event: 'delta'; text: string }
  | { event: 'completed'; reply: AiReply }
  | { event: 'error'; message: string }

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

  /**
   * 生成流式回复（SSE，text/event-stream）
   *
   * 事件协议（与后端 8.1.1 一致）：
   *   `started`   → `{ replyId }`，回复已持久化为 RUNNING，可立即用 getReply 查询
   *   `delta`     → `{ text }`，按接收顺序拼接
   *   `completed` → 完整 AiReply，**仍以其中的 runStatus / planStatus 为准**
   *   `error`     → 统一错误对象
   *
   * 实现说明：浏览器端用 axios 的 `onDownloadProgress` 读取增量
   * （XHR 的 responseText 会随下载增长），兼容 LF、CRLF 与跨分片事件。
   * 断线或超时由调用方 abort；模型不支持流式时后端会退回同步并一次性发完整文本，协议不变。
   *
   * @param sessionId 会话 ID
   * @param body 与同步生成相同的请求体（含 idempotencyKey）
   * @param onEvent 每解析出一个事件回调一次
   * @param signal 可选 AbortSignal，用于取消
   */
  async streamReply(
    sessionId: number,
    body: AiReplyRequest,
    onEvent: (event: AiStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    let consumed = 0
    const parser = createSseParser((name, data) => {
      let parsed
      try { parsed = JSON.parse(data) } catch { return }
      if (name === 'started') onEvent({ event: 'started', replyId: parsed.replyId })
      else if (name === 'delta') onEvent({ event: 'delta', text: parsed.text ?? '' })
      else if (name === 'completed') onEvent({ event: 'completed', reply: parsed })
      else if (name === 'error') onEvent({ event: 'error', message: parsed.msg ?? parsed.message ?? '流式回复失败' })
    })
    const response = await http.post(API_ENDPOINTS.ai.replyStream(sessionId), body, {
      responseType: 'text',
      signal,
      // SSE 连接可能持续较久，不能沿用默认 15 秒超时
      timeout: 180000,
      headers: { Accept: 'text/event-stream' },
      transformResponse: [(data: unknown) => data],
      onDownloadProgress: (event) => {
        const xhr = event.event?.target as XMLHttpRequest | undefined
        const text = xhr?.responseText ?? ''
        if (text.length > consumed) {
          parser.push(text.slice(consumed))
          consumed = text.length
        }
      },
    })
    // Some adapters only supply text at completion; consume the remainder exactly once.
    if (typeof response.data === 'string' && response.data.length > consumed) {
      parser.push(response.data.slice(consumed))
    }
    parser.finish()
  },
}
