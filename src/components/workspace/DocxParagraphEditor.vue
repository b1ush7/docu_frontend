<script setup lang="ts">
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-tab-pane.css'
import 'element-plus/theme-chalk/el-tabs.css'

import { ElButton, ElDialog, ElInput, ElTabPane, ElTabs } from 'element-plus'

/**
 * @component DocxParagraphEditor
 * @description DOCX 段落级人工编辑（API.md 4.4 替换段落文本、4.5 插入或删除段落）。
 *
 * 为什么分两个页签：后端是两个独立接口，语义不同 ——
 *   - `paragraph-text`：把指定段落的文本替换掉（可批量，最多 100 个）
 *   - `paragraph-edits`：在某段之前/之后插入新段，或删除某段
 * 混在一起提交会让"取消某一类修改"变得不清楚，所以分开。
 *
 * 关键约束（来自后端 DTO）：
 *   - `blockId` 只在**单一版本内稳定**，编辑产生新版本后必须重新读取结构；
 *     所以每次提交成功后本对话框会重新拉结构。
 *   - 替换接口要求 `text` **不能为 null**（允许空字符串表示清空段落）。
 *   - 插入接口要求 `text` 必填；删除接口要求**不传** `text`。
 *   - 整批 operations **只创建一个版本**，不是一条一个版本。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { docxApi } from '@/api/docx'
import { useRequestGuard } from '@/composables/useRequestGuard'
import { ApiError } from '@/api/http'
import type {
  DocBlock,
  DocxParagraphEditOperation,
  DocxStructure,
  DocxParagraphTextOperation,
  Version,
} from '@/api/types'

const props = defineProps<{
  modelValue: boolean
  fileId: number | null
  versionNo: number | null
}>()

const requestGuard = useRequestGuard(() => [props.modelValue, props.fileId, props.versionNo])

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** 编辑成功，父组件切到新版本预览 */
  (e: 'edited', version: Version): void
}>()

/** 段落型块的 blockId 规则（与后端 @Pattern 一致） */
const PARAGRAPH_ID = /^(?:body|header\d+|footer\d+)(?:\/t\d+\/r\d+\/c\d+)*\/p\d+$/

const structure = ref<DocxStructure | null>(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
/** 页签：replace 替换文本 / insert 插入删除 */
const tab = ref<'replace' | 'insert'>('replace')

/** 替换草稿：blockId → 新文本 */
const drafts = ref<Record<string, string>>({})
/** 插入/删除操作列表 */
const edits = ref<DocxParagraphEditOperation[]>([])

/** 可编辑的段落块（标题在 OOXML 里也是段落，一并允许编辑文本） */
const paragraphs = computed<DocBlock[]>(
  () => (structure.value?.blocks ?? []).filter((b) => PARAGRAPH_ID.test(b.blockId)),
)

/** 实际发生变化的替换操作 */
const changed = computed<DocxParagraphTextOperation[]>(() =>
  paragraphs.value
    .filter((b) => (drafts.value[b.blockId] ?? b.text ?? '') !== (b.text ?? ''))
    .map((b) => ({ blockId: b.blockId, text: drafts.value[b.blockId] ?? '' })),
)

function close(): void {
  emit('update:modelValue', false)
}

/** 加载最新结构，并重置草稿 */
async function loadStructure(): Promise<void> {
  const isCurrent = requestGuard('loadStructure')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
  loading.value = true
  error.value = ''
  try {
    const value = await docxApi.getStructure(fileId, versionNo)
    if (!isCurrent()) return
    structure.value = value
    drafts.value = Object.fromEntries(value.blocks.map((b) => [b.blockId, b.text ?? '']))
    edits.value = []
  } catch (e) {
    if (!isCurrent()) return
    // 400/415：不是 DOCX
    error.value = e instanceof ApiError ? e.message : '结构加载失败'
  } finally {
    if (isCurrent()) loading.value = false
  }
}

// 打开时加载
watch(
  () => [props.modelValue, props.fileId, props.versionNo] as const,
  ([visible]) => {
    submitting.value = false
    loading.value = false
    if (!visible) return
    tab.value = 'replace'
    structure.value = null
    drafts.value = {}
    edits.value = []
    void loadStructure()
  },
  { flush: 'sync' },
)

/** 批量替换段落文本 */
async function submitReplace(): Promise<void> {
  if (submitting.value) return
  const isCurrent = requestGuard('submitReplace')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
  if (!changed.value.length) {
    ElMessage.warning('没有任何修改')
    return
  }
  if (changed.value.length > 100) {
    ElMessage.warning('单次最多替换 100 个段落')
    return
  }
  submitting.value = true
  try {
    const version = await docxApi.replaceParagraphText(fileId, versionNo, {
      operations: changed.value,
    })
    if (!isCurrent()) return
    ElMessage.success('已创建新版本')
    emit('edited', version)
    close()
  } catch (e) {
    if (!isCurrent()) return
    error.value = e instanceof ApiError ? e.message : '替换失败'
  } finally {
    if (isCurrent()) submitting.value = false
  }
}

/** 在指定段落前后插入 */
function insertRelative(block: DocBlock, position: 'before' | 'after'): void {
  if (edits.value.length >= 100) {
    ElMessage.warning('单次最多 100 个操作')
    return
  }
  edits.value.push({
    type: position === 'before' ? 'INSERT_BEFORE' : 'INSERT_AFTER',
    blockId: block.blockId,
    text: '',
  })
}

/** 删除指定段落（DELETE 不能带 text） */
function markDelete(block: DocBlock): void {
  if (edits.value.length >= 100) {
    ElMessage.warning('单次最多 100 个操作')
    return
  }
  edits.value.push({ type: 'DELETE', blockId: block.blockId })
}

function removeEdit(index: number): void {
  edits.value.splice(index, 1)
}

/** 提交插入/删除 */
async function submitEdits(): Promise<void> {
  if (submitting.value) return
  const isCurrent = requestGuard('submitEdits')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
  if (!edits.value.length) {
    ElMessage.warning('还没有添加任何操作')
    return
  }
  if (edits.value.some((op) => op.type !== 'DELETE' && !(op.text ?? '').trim())) {
    ElMessage.warning('插入操作的文本不能为空')
    return
  }
  submitting.value = true
  try {
    const version = await docxApi.editParagraphs(fileId, versionNo, {
      operations: edits.value,
    })
    if (!isCurrent()) return
    ElMessage.success('已创建新版本')
    emit('edited', version)
    close()
  } catch (e) {
    if (!isCurrent()) return
    error.value = e instanceof ApiError ? e.message : '提交失败'
  } finally {
    if (isCurrent()) submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    append-to-body
    :model-value="modelValue"
    title="DOCX 段落编辑"
    width="820px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="pe">
      <p class="pe__hint">
        <strong>整批操作只创建一个新版本</strong>。编辑后 <code>blockId</code> 会失效，本对话框提交成功后会重新读取结构。
      </p>

      <p v-if="error" class="pe__hint pe__hint--warn" role="alert">{{ error }}</p>
      <p v-if="loading" class="pe__hint">结构加载中…</p>

      <el-tabs v-if="structure" v-model="tab">
        <!-- 替换段落文本 -->
        <el-tab-pane label="替换文本" name="replace">
          <p class="pe__hint">
            共 {{ paragraphs.length }} 个可编辑段落，已修改 <strong>{{ changed.length }}</strong> 个（单次上限 100）。
          </p>
          <div class="pe__list">
            <label v-for="block in paragraphs" :key="block.blockId" class="pe__row">
              <span class="pe__row-head">
                <span class="pe__tag">{{ block.type }}</span>
                <span class="pe__id">{{ block.blockId }}</span>
                <span v-if="(drafts[block.blockId] ?? '') !== (block.text ?? '')" class="pe__changed">已修改</span>
              </span>
              <el-input
                v-model="drafts[block.blockId]"
                type="textarea"
                :rows="2"
                placeholder="留空表示清空该段落"
              />
            </label>
          </div>
          <div class="pe__actions">
            <el-button size="small" @click="close">取消</el-button>
            <el-button type="primary" size="small" :loading="submitting" :disabled="!changed.length" @click="submitReplace">
              提交 {{ changed.length }} 处替换
            </el-button>
          </div>
        </el-tab-pane>

        <!-- 插入 / 删除段落 -->
        <el-tab-pane label="插入 / 删除" name="insert">
          <p class="pe__hint">
            在段落前后插入新段落或删除段落。删除操作<strong>不带文本</strong>；插入必须填写文本。
          </p>

          <div class="pe__list pe__list--short">
            <div v-for="block in paragraphs" :key="block.blockId" class="pe__row pe__row--inline">
              <span class="pe__row-head">
                <span class="pe__tag">{{ block.type }}</span>
                <span class="pe__id">{{ block.blockId }}</span>
              </span>
              <div class="pe__mini-actions">
                <el-button size="small" @click="insertRelative(block, 'before')">上方插入</el-button>
                <el-button size="small" @click="insertRelative(block, 'after')">下方插入</el-button>
                <el-button size="small" type="danger" @click="markDelete(block)">删除</el-button>
              </div>
            </div>
          </div>

          <template v-if="edits.length">
            <p class="pe__hint">待提交操作（{{ edits.length }}）</p>
            <div class="pe__list">
              <div v-for="(op, index) in edits" :key="index" class="pe__row">
                <span class="pe__row-head">
                  <span class="pe__tag">{{ op.type }}</span>
                  <span class="pe__id">{{ op.blockId }}</span>
                  <el-button link type="danger" size="small" @click="removeEdit(index)">移除</el-button>
                </span>
                <el-input
                  v-if="op.type !== 'DELETE'"
                  v-model="op.text"
                  type="textarea"
                  :rows="2"
                  placeholder="新段落文本（必填）"
                />
              </div>
            </div>
            <div class="pe__actions">
              <el-button size="small" @click="close">取消</el-button>
              <el-button type="primary" size="small" :loading="submitting" @click="submitEdits">
                提交 {{ edits.length }} 个操作
              </el-button>
            </div>
          </template>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.pe {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  max-height: 70vh;
  overflow-y: auto;
}

.pe__hint {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink-soft;

  code {
    font-family: $font-serif;
  }
}

.pe__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.pe__list {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  max-height: 46vh;
  overflow-y: auto;
  margin-top: $gap-xs;
}

.pe__list--short {
  max-height: 22vh;
}

.pe__row {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  padding: $gap-xs $gap-sm;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
}

.pe__row--inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: $gap-sm;
}

.pe__row-head {
  display: flex;
  align-items: center;
  gap: $gap-xs;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.pe__tag {
  color: $ink;
  font-weight: $weight-medium;
}

.pe__id {
  font-family: $font-serif;
}

.pe__changed {
  color: $accent;
  font-weight: $weight-medium;
}

.pe__mini-actions {
  display: flex;
  gap: $gap-xs;
}

.pe__actions {
  display: flex;
  justify-content: flex-end;
  gap: $gap-sm;
  margin-top: $gap-sm;
}
</style>
