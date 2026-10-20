<script setup lang="ts">
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-checkbox.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/el-option-group.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-pagination.css'

import { ElButton, ElCheckbox, ElDialog, ElInput, ElOption, ElPagination, ElSelect } from 'element-plus'

import { ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useAiHistory } from '@/composables/useAiHistory'
import { formatTime } from '@/utils/format'
import type { AiSession, AiSessionStatus } from '@/api/types'

const props = defineProps<{ modelValue: boolean; fileId: number | null; opening: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  reply: [sessionId: number, messageId: number]
  changed: [sessionId: number]
}>()
const history = useAiHistory()
const keyword = ref('')
const status = ref<AiSessionStatus | ''>('')
const onlyCurrentFile = ref(false)
const page = ref(1)
function beforeClose(done: () => void): void { if (!props.opening && !history.acting.value) done() }
function updateVisible(value: boolean): void { if (!props.opening && !history.acting.value) emit('update:modelValue', value) }
function load(): void {
  void history.load({ page: page.value, size: 10, keyword: keyword.value.trim() || undefined,
    status: status.value || undefined, fileId: onlyCurrentFile.value && props.fileId !== null ? props.fileId : undefined })
}
function search(): void { page.value = 1; load() }
watch(() => props.modelValue, visible => { if (visible) { page.value = 1; load() } }, { immediate: true })
watch(() => props.fileId, () => { if (props.modelValue && onlyCurrentFile.value) search() })
async function archive(session: AiSession): Promise<void> {
  try { await ElMessageBox.confirm('归档后只能查看历史，无法继续发送、确认或放弃未处理修改。确定归档吗？', '归档会话', { type: 'warning' }) }
  catch { return }
  if (await history.archive(session)) { emit('changed', session.id); load() }
}
async function remove(session: AiSession): Promise<void> {
  try { await ElMessageBox.confirm('删除会话和全部消息，尚未处理的计划也将无法找回。确定删除吗？', '删除会话', { type: 'warning' }) }
  catch { return }
  if (await history.remove(session)) { emit('changed', session.id); if (history.sessions.value.length === 0 && page.value > 1) page.value--; load() }
}
</script>

<template>
  <el-dialog append-to-body :model-value="modelValue" title="AI 会话历史" width="min(1040px, 94vw)"
    :close-on-click-modal="!opening && !history.acting.value" :show-close="!opening && !history.acting.value"
    :before-close="beforeClose" @update:model-value="updateVisible">
    <div class="history-filters">
      <el-input v-model="keyword" maxlength="100" placeholder="搜索会话" clearable @keyup.enter="search" style="width: 200px" />
      <el-select v-model="status" aria-label="会话状态" placeholder="全部状态" style="width: 120px" @change="search"><el-option label="全部状态" value="" /><el-option label="进行中" value="ACTIVE" /><el-option label="已归档" value="ARCHIVED" /></el-select>
      <el-checkbox v-model="onlyCurrentFile" :disabled="fileId === null" @change="search">仅当前文件</el-checkbox>
      <el-button :loading="history.loading.value" @click="search">查询／刷新</el-button>
    </div>
    <p v-if="history.error.value" role="alert">{{ history.error.value }}</p>
    <div class="history-columns">
      <section v-loading="history.loading.value">
        <p v-if="!history.loading.value && !history.sessions.value.length">暂无会话</p>
        <article v-for="session in history.sessions.value" :key="session.id" :class="{ selected: history.selected.value?.id === session.id }">
          <el-button link :disabled="opening || history.acting.value" @click="history.select(session)">{{ session.title || '未命名会话' }}</el-button>
          <p>{{ session.fileId === null ? '纯对话' : `文件 #${session.fileId}` }} · {{ session.status === 'ARCHIVED' ? '已归档' : '进行中' }} · {{ formatTime(session.updateTime) }}</p>
          <el-button v-if="session.status === 'ACTIVE'" link :disabled="opening || history.acting.value" @click="archive(session)">归档</el-button>
          <el-button link :disabled="opening || history.acting.value" @click="remove(session)">删除</el-button>
        </article>
        <el-pagination v-model:current-page="page" :page-size="10" :total="history.total.value" layout="prev, pager, next" :disabled="opening || history.acting.value" @current-change="load" />
      </section>
      <section v-loading="history.messagesLoading.value">
        <p v-if="!history.selected.value">选择会话查看消息；点击 AI 回复可恢复确认计划或查看输出版本。</p>
        <p v-else-if="!history.messagesLoading.value && !history.messages.value.length">该会话暂无消息</p>
        <article v-for="message in history.messages.value" :key="message.id">
          <strong>{{ message.role === 'USER' ? '你' : 'AI' }}</strong>
          <p>{{ message.content }}</p>
          <el-button v-if="message.role === 'ASSISTANT'" :loading="opening" :disabled="opening || history.acting.value"
            @click="emit('reply', message.sessionId, message.id)">查看回复／恢复计划</el-button>
        </article>
      </section>
    </div>
  </el-dialog>
</template>

<style scoped>
.history-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.history-columns { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr); gap: 18px; }
.history-columns section { max-height: 60vh; overflow: auto; }
article { padding: 12px; border-bottom: 1px solid var(--line, #d8d2c4); }
article.selected { background: var(--paper-base, #f7f3eb); }
p { white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 700px) { .history-columns { grid-template-columns: 1fr; } .history-columns section { max-height: 30vh; } }
</style>
