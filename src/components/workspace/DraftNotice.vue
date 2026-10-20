<script setup lang="ts">
import type { useEditorDraft } from '@/composables/useEditorDraft'
defineProps<{ draft: ReturnType<typeof useEditorDraft> }>()
</script>
<template>
  <aside class="draft-notice">
    <template v-if="draft.available.value">
      本浏览器保存了此账号和版本的草稿。
      <button type="button" @click="draft.restore">恢复草稿</button>
      <button type="button" @click="draft.remove">删除缓存草稿</button>
    </template>
    <span v-else-if="draft.dirty.value">修改尚未提交。</span>
    <span v-if="draft.storageError.value" role="alert">{{ draft.storageError.value }}</span>
  </aside>
</template>
<style scoped>
.draft-notice { font-size: 12px; padding: 6px 0; color: var(--ink-soft); }
.draft-notice button { margin-inline: 6px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 4px; cursor: pointer; background: var(--paper-surface); }
</style>
