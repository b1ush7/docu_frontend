import { ref } from 'vue'
import { aiApi } from '@/api/ai'
import type { AiMessage, AiSession, AiSessionListParams } from '@/api/types'

export function useAiHistory() {
  const sessions = ref<AiSession[]>([])
  const total = ref(0)
  const loading = ref(false)
  const selected = ref<AiSession | null>(null)
  const messages = ref<AiMessage[]>([])
  const messagesLoading = ref(false)
  const acting = ref(false)
  const error = ref('')
  let listRequest = 0
  let messageRequest = 0
  async function load(params: AiSessionListParams): Promise<void> {
    if (acting.value) return
    const request = ++listRequest
    loading.value = true
    error.value = ''
    try {
      const result = await aiApi.listSessions(params)
      if (request !== listRequest) return
      sessions.value = result.records
      total.value = result.total
    } catch (cause) { if (request === listRequest) error.value = cause instanceof Error ? cause.message : '会话列表加载失败' }
    finally { if (request === listRequest) loading.value = false }
  }
  async function select(session: AiSession): Promise<void> {
    if (acting.value) return
    const request = ++messageRequest
    selected.value = session
    messages.value = []
    messagesLoading.value = true
    error.value = ''
    try {
      const result = await aiApi.listMessages(session.id)
      if (request === messageRequest) messages.value = result.filter(message => ['USER', 'ASSISTANT'].includes(message.role))
    } catch (cause) { if (request === messageRequest) error.value = cause instanceof Error ? cause.message : '消息加载失败' }
    finally { if (request === messageRequest) messagesLoading.value = false }
  }
  async function archive(session: AiSession): Promise<boolean> {
    if (acting.value) return false
    acting.value = true
    listRequest++
    loading.value = false
    error.value = ''
    try {
      const result = await aiApi.archiveSession(session.id)
      sessions.value = sessions.value.map(item => item.id === session.id ? result : item)
      if (selected.value?.id === session.id) selected.value = result
      return true
    } catch (cause) { error.value = cause instanceof Error ? cause.message : '归档失败'; return false }
    finally { acting.value = false }
  }
  async function remove(session: AiSession): Promise<boolean> {
    if (acting.value) return false
    acting.value = true
    listRequest++
    loading.value = false
    error.value = ''
    try {
      await aiApi.deleteSession(session.id)
      sessions.value = sessions.value.filter(item => item.id !== session.id)
      total.value = Math.max(0, total.value - 1)
      if (selected.value?.id === session.id) {
        messageRequest++
        selected.value = null
        messages.value = []
        messagesLoading.value = false
      }
      return true
    } catch (cause) { error.value = cause instanceof Error ? cause.message : '删除失败'; return false }
    finally { acting.value = false }
  }
  return { sessions, total, loading, selected, messages, messagesLoading, acting, error, load, select, archive, remove }
}
