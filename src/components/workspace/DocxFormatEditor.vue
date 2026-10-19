<script setup lang="ts">
/**
 * @component DocxFormatEditor
 * @description DOCX 段落格式人工编辑（API.md 4.7）。
 *
 * 支持 7 种格式操作：
 *   SET_HEADING / SET_NORMAL / SET_BULLET / SET_NUMBERED
 *   CLEAR_LIST / SET_PAGE_BREAK_BEFORE / CLEAR_PAGE_BREAK_BEFORE
 *
 * 后端约束（FormatDocxParagraphsDTO）：
 *   - `blockId` 必须指向**正文或表格单元格中的段落**（形如 `body/p1` 或 `body/t0/r1/c0/p2`），
 *     不允许页眉页脚段落；所以这里只列 `body` 开头的段落。
 *   - `level` 只在 SET_HEADING 时使用，1～9。
 *   - 单次最多 100 个操作，整批只创建一个版本。
 *
 * 面板上同时展示每个段落当前的样式信息（styleId / headingLevel / numberingFormat /
 * pageBreakBefore），让用户在改之前能看到现状，而不是盲改。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { docxApi } from '@/api/docx'
import { ApiError } from '@/api/http'
import type { DocBlock, DocxParagraphFormatOperation, DocxStructure, Version } from '@/api/types'

const props = defineProps<{
  modelValue: boolean
  fileId: number | null
  versionNo: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'edited', version: Version): void
}>()

/** 后端只接受正文段落，页眉页脚段落会被拒 */
const BODY_PARAGRAPH = /^body(?:\/t\d+\/r\d+\/c\d+)*\/p\d+$/

/** 格式类型 → 中文名 */
const FORMATS: Array<{ value: DocxParagraphFormatOperation['type']; label: string }> = [
  { value: 'SET_HEADING', label: '设为标题' },
  { value: 'SET_NORMAL', label: '设为正文' },
  { value: 'SET_BULLET', label: '设为无序列表' },
  { value: 'SET_NUMBERED', label: '设为有序列表' },
  { value: 'CLEAR_LIST', label: '清除列表' },
  { value: 'SET_PAGE_BREAK_BEFORE', label: '段前分页' },
  { value: 'CLEAR_PAGE_BREAK_BEFORE', label: '取消段前分页' },
]

const structure = ref<DocxStructure | null>(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')

/** 待提交操作 */
const operations = ref<DocxParagraphFormatOperation[]>([])

/** 可操作的正文段落 */
const paragraphs = computed<DocBlock[]>(
  () => (structure.value?.blocks ?? []).filter((b) => BODY_PARAGRAPH.test(b.blockId)),
)

function close(): void {
  emit('update:modelValue', false)
}

/** 读取结构 */
async function loadStructure(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  loading.value = true
  error.value = ''
  try {
    structure.value = await docxApi.getStructure(props.fileId, props.versionNo)
    operations.value = []
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '结构加载失败'
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.fileId, props.versionNo] as const,
  ([visible]) => {
    if (!visible) return
    structure.value = null
    operations.value = []
    void loadStructure()
  },
)

/** 追加一个格式操作 */
function addOperation(): void {
  if (operations.value.length >= 100) {
    ElMessage.warning('单次最多 100 个操作')
    return
  }
  const first = paragraphs.value[0]
  operations.value.push({
    type: 'SET_HEADING',
    blockId: first?.blockId ?? '',
    level: 1,
  })
}

function removeOperation(index: number): void {
  operations.value.splice(index, 1)
}

/** 段落现状的可读描述 */
function describe(block: DocBlock): string {
  const parts: string[] = []
  if (block.styleId) parts.push(`样式 ${block.styleId}`)
  if (block.headingLevel !== null) parts.push(`${block.headingLevel} 级标题`)
  if (block.numberingFormat) parts.push(`编号 ${block.numberingFormat}`)
  if (block.pageBreakBefore) parts.push('段前分页')
  return parts.length ? parts.join(' · ') : '正文'
}

/** 段落的简短预览文本 */
function preview(block: DocBlock): string {
  const text = (block.text ?? '').trim()
  if (!text) return '（空段落）'
  return text.length > 36 ? `${text.slice(0, 36)}…` : text
}

/** 提交 */
async function submit(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  if (!operations.value.length) {
    ElMessage.warning('还没有添加任何格式操作')
    return
  }
  if (operations.value.some((op) => !op.blockId)) {
    ElMessage.warning('每个操作都要选择目标段落')
    return
  }
  submitting.value = true
  try {
    const version = await docxApi.formatParagraphs(props.fileId, props.versionNo, {
      operations: operations.value,
    })
    ElMessage.success('已创建新版本')
    emit('edited', version)
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '提交失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    append-to-body
    :model-value="modelValue"
    title="DOCX 段落格式"
    width="780px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="fe">
      <p class="fe__hint">
        只支持<strong>正文或表格单元格中的段落</strong>，页眉页脚段落不在范围内。
        整批操作<strong>只创建一个新版本</strong>。
      </p>

      <p v-if="error" class="fe__hint fe__hint--warn" role="alert">{{ error }}</p>
      <p v-if="loading" class="fe__hint">结构加载中…</p>

      <template v-if="structure">
        <p class="fe__hint">共 {{ paragraphs.length }} 个可编辑段落。</p>

        <!-- 段落现状：让用户改之前先看到现状 -->
        <div class="fe__list fe__list--short">
          <div v-for="block in paragraphs" :key="block.blockId" class="fe__row fe__row--inline">
            <span class="fe__row-head">
              <span class="fe__id">{{ block.blockId }}</span>
              <span class="fe__text">{{ preview(block) }}</span>
            </span>
            <span class="fe__style">{{ describe(block) }}</span>
          </div>
        </div>

        <div class="fe__ops">
          <p class="fe__hint">待提交操作（{{ operations.length }} / 100）</p>
          <div v-for="(op, index) in operations" :key="index" class="fe__op">
            <el-select v-model="op.type" class="fe__op-type">
              <el-option v-for="f in FORMATS" :key="f.value" :label="f.label" :value="f.value" />
            </el-select>
            <el-select v-model="op.blockId" class="fe__op-target" filterable placeholder="目标段落">
              <el-option
                v-for="block in paragraphs"
                :key="block.blockId"
                :label="`${block.blockId} · ${preview(block)}`"
                :value="block.blockId"
              />
            </el-select>
            <el-input-number
              v-if="op.type === 'SET_HEADING'"
              v-model="op.level"
              :min="1"
              :max="9"
              class="fe__op-level"
            />
            <el-button link type="danger" size="small" @click="removeOperation(index)">移除</el-button>
          </div>

          <div class="fe__actions">
            <el-button size="small" @click="addOperation">添加格式操作</el-button>
            <span class="fe__spacer" />
            <el-button size="small" @click="close">取消</el-button>
            <el-button type="primary" size="small" :loading="submitting" :disabled="!operations.length" @click="submit">
              提交 {{ operations.length }} 个操作
            </el-button>
          </div>
        </div>
      </template>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.fe {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  max-height: 70vh;
  overflow-y: auto;
}

.fe__hint {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.fe__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.fe__list {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  overflow-y: auto;
}

.fe__list--short {
  max-height: 26vh;
}

.fe__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $gap-sm;
  padding: $gap-xs $gap-sm;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
  font-size: $font-size-caption;
}

.fe__row-head {
  display: flex;
  gap: $gap-xs;
  min-width: 0;
}

.fe__id {
  flex: none;
  font-family: $font-serif;
  color: $ink-soft;
}

.fe__text {
  color: $ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fe__style {
  flex: none;
  color: $ink-soft;
}

.fe__ops {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  padding-top: $gap-sm;
  border-top: $border-w solid $line;
}

.fe__op {
  display: flex;
  align-items: center;
  gap: $gap-xs;
}

.fe__op-type {
  width: 150px;
}

.fe__op-target {
  flex: 1;
  min-width: 0;
}

.fe__op-level {
  width: 110px;
}

.fe__actions {
  display: flex;
  align-items: center;
  gap: $gap-sm;
  margin-top: $gap-xs;
}

.fe__spacer {
  flex: 1;
}
</style>
