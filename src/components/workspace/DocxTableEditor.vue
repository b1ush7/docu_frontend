<script setup lang="ts">
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-checkbox.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-input-number.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/el-option-group.css'
import 'element-plus/theme-chalk/el-select.css'

import { ElButton, ElCheckbox, ElDialog, ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'

/**
 * @component DocxTableEditor
 * @description DOCX 表格人工编辑（API.md 4.6）。
 *
 * 支持 9 种操作：
 *   SET_CELL_TEXT / INSERT_ROW_BEFORE / INSERT_ROW_AFTER / DELETE_ROW
 *   SET_ROW_HEIGHT / SET_COLUMN_WIDTH / MERGE_CELLS / SPLIT_CELL / REPEAT_HEADER_ROW
 *
 * 后端约束（EditDocxTableDTO）：
 *   - `blockId` 对不同操作指向不同对象：单元格操作指向 CELL，行操作指向 ROW。
 *   - 插入行必须给 `values`，且元素数量必须与参照行的列数一致。
 *   - `dimensionTwips` 用于 SET_COLUMN_WIDTH / SET_ROW_HEIGHT，范围 1～20000（twips）。
 *   - MERGE_CELLS 需要 `endBlockId` 指定矩形右下单元格；SPLIT_CELL 不用它。
 *   - 单次最多 100 个操作，整批只创建一个版本。
 *
 * 交互取舍：用「表格预览 + 操作列表」而不是直接在网格上拖拽编辑。
 * 原因是后端是批处理接口，用户需要先看清要提交哪些变更再一次性提交；
 * 网格直编辑会让人以为改动已经生效。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { docxApi } from '@/api/docx'
import { useRequestGuard } from '@/composables/useRequestGuard'
import { ApiError } from '@/api/http'
import type { DocBlock, DocxStructure, DocxTableEditOperation, Version } from '@/api/types'

const props = defineProps<{
  modelValue: boolean
  fileId: number | null
  versionNo: number | null
}>()

const requestGuard = useRequestGuard(() => [props.modelValue, props.fileId, props.versionNo])

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'edited', version: Version): void
}>()

/** 9 种操作及目标对象类型 */
const TYPES: Array<{ value: DocxTableEditOperation['type']; label: string; target: 'CELL' | 'ROW' }> = [
  { value: 'SET_CELL_TEXT', label: '设置单元格文本', target: 'CELL' },
  { value: 'INSERT_ROW_BEFORE', label: '在上方插入行', target: 'ROW' },
  { value: 'INSERT_ROW_AFTER', label: '在下方插入行', target: 'ROW' },
  { value: 'DELETE_ROW', label: '删除行', target: 'ROW' },
  { value: 'SET_ROW_HEIGHT', label: '设置行高（twips）', target: 'ROW' },
  { value: 'SET_COLUMN_WIDTH', label: '设置列宽（twips）', target: 'CELL' },
  { value: 'MERGE_CELLS', label: '合并单元格', target: 'CELL' },
  { value: 'SPLIT_CELL', label: '拆分单元格', target: 'CELL' },
  { value: 'REPEAT_HEADER_ROW', label: '设为重复表头', target: 'ROW' },
]

const structure = ref<DocxStructure | null>(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')

/** 当前选中的表格块 */
const tableId = ref<string>('')
/** 待提交操作 */
const operations = ref<DocxTableEditOperation[]>([])

const tables = computed<DocBlock[]>(
  () => (structure.value?.blocks ?? []).filter((b) => b.type === 'TABLE'),
)

const currentTable = computed<DocBlock | null>(
  () => tables.value.find((t) => t.blockId === tableId.value) ?? null,
)

/** 当前表格的行 */
const rows = computed<DocBlock[]>(
  () => (currentTable.value?.children ?? []).filter((c) => c.type === 'ROW'),
)

/** 当前表格的全部单元格（带所属行信息，便于展示） */
const cells = computed<DocBlock[]>(() =>
  rows.value.flatMap((row) => row.children.filter((c) => c.type === 'CELL')),
)

/** 某行的列数 */
function columnCount(row: DocBlock): number {
  return row.children.filter((c) => c.type === 'CELL').length
}

function close(): void {
  emit('update:modelValue', false)
}

async function loadStructure(): Promise<void> {
  const isCurrent = requestGuard('loadStructure')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
  loading.value = true
  error.value = ''
  try {
    const structureResponse = await docxApi.getStructure(fileId, versionNo)
    if (!isCurrent()) return
    structure.value = structureResponse
    tableId.value = structure.value.blocks.find((b) => b.type === 'TABLE')?.blockId ?? ''
    operations.value = []
  } catch (e) {
    if (!isCurrent()) return
    error.value = e instanceof ApiError ? e.message : '结构加载失败'
  } finally {
    if (isCurrent()) loading.value = false
  }
}

watch(
  () => [props.modelValue, props.fileId, props.versionNo] as const,
  ([visible]) => {
    submitting.value = false
    loading.value = false
    if (!visible) return
    structure.value = null
    operations.value = []
    void loadStructure()
  },
  { flush: 'sync' },
)

/** 新增一个操作：按类型给出合理默认值 */
function addOperation(): void {
  if (operations.value.length >= 100) {
    ElMessage.warning('单次最多 100 个操作')
    return
  }
  const firstRow = rows.value[0]
  const firstCell = cells.value[0]
  operations.value.push({
    type: 'SET_CELL_TEXT',
    blockId: firstCell?.blockId ?? '',
    text: '',
  })
  void firstRow
}

function removeOperation(index: number): void {
  operations.value.splice(index, 1)
}

/** 某个操作应该选 CELL 还是 ROW */
function targetKind(op: DocxTableEditOperation): 'CELL' | 'ROW' {
  return TYPES.find((t) => t.value === op.type)?.target ?? 'CELL'
}

/** 可选目标列表 */
function targetsFor(op: DocxTableEditOperation): DocBlock[] {
  return targetKind(op) === 'ROW' ? rows.value : cells.value
}

/** 插入行需要填 values，用逗号分隔；这里提示期望的列数 */
function expectedColumns(op: DocxTableEditOperation): number | null {
  const row = rows.value.find((r) => r.blockId === op.blockId)
  return row ? columnCount(row) : null
}

/** 提交前校验，尽量避免白跑一次请求 */
function validate(): string | null {
  if (!operations.value.length) return '还没有添加任何操作'
  for (const [index, op] of operations.value.entries()) {
    const no = index + 1
    if (!op.blockId) return `第 ${no} 个操作未选择目标`
    if (op.type === 'SET_CELL_TEXT' && (op.text ?? '') === '') return `第 ${no} 个操作：单元格文本不能为空`
    if (op.type === 'INSERT_ROW_BEFORE' || op.type === 'INSERT_ROW_AFTER') {
      const values = op.values ?? []
      if (!values.length) return `第 ${no} 个操作：插入行必须填写单元格内容`
      const expect = expectedColumns(op)
      if (expect !== null && values.length !== expect) {
        return `第 ${no} 个操作：需要 ${expect} 个单元格内容，当前 ${values.length} 个`
      }
    }
    if (op.type === 'MERGE_CELLS' && !op.endBlockId) return `第 ${no} 个操作：合并需要指定右下单元格`
    if ((op.type === 'SET_ROW_HEIGHT' || op.type === 'SET_COLUMN_WIDTH') && !op.dimensionTwips) {
      return `第 ${no} 个操作：需要填写尺寸（1～20000 twips）`
    }
  }
  return null
}

async function submit(): Promise<void> {
  if (submitting.value) return
  const isCurrent = requestGuard('submit')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
  const invalid = validate()
  if (invalid) {
    ElMessage.warning(invalid)
    return
  }
  submitting.value = true
  try {
    const version = await docxApi.editTable(fileId, versionNo, {
      operations: operations.value,
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

/** 单元格文本预览 */
function cellText(cell: DocBlock): string {
  return cell.children
    .filter((c) => c.type === 'PARAGRAPH')
    .map((c) => c.text ?? '')
    .join(' ')
    .trim()
}
</script>

<template>
  <el-dialog
    append-to-body
    :model-value="modelValue"
    title="DOCX 表格编辑"
    width="860px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="te">
      <p class="te__hint">
        白名单在<strong>操作列表</strong>里逐条添加，最后一次性提交 —— 整批<strong>只创建一个新版本</strong>。
        单元格操作选 <code>CELL</code>，行操作选 <code>ROW</code>。
      </p>

      <p v-if="error" class="te__hint te__hint--warn" role="alert">{{ error }}</p>
      <p v-if="loading" class="te__hint">结构加载中…</p>
      <p v-else-if="!tables.length" class="te__hint">当前版本没有表格。</p>

      <template v-if="tables.length">
        <el-select v-model="tableId" class="te__table-select" placeholder="选择表格">
          <el-option
            v-for="(t, i) in tables"
            :key="t.blockId"
            :label="`表格 ${i + 1} · ${t.blockId} · ${t.children.filter((c) => c.type === 'ROW').length} 行`"
            :value="t.blockId"
          />
        </el-select>

        <!-- 表格预览：只读，避免让人以为已生效 -->
        <div v-if="currentTable" class="te__preview">
          <table class="te__grid">
            <tbody>
              <tr v-for="row in rows" :key="row.blockId">
                <td v-for="cell in row.children.filter((c) => c.type === 'CELL')" :key="cell.blockId">
                  <span class="te__cell-text">{{ cellText(cell) || '（空）' }}</span>
                  <span class="te__cell-id">{{ cell.blockId }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="te__ops">
          <p class="te__hint">待提交操作（{{ operations.length }} / 100）</p>
          <div v-for="(op, index) in operations" :key="index" class="te__op">
            <el-select v-model="op.type" class="te__op-type">
              <el-option v-for="t in TYPES" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>

            <el-select v-model="op.blockId" class="te__op-target" filterable placeholder="目标">
              <el-option
                v-for="item in targetsFor(op)"
                :key="item.blockId"
                :label="item.blockId"
                :value="item.blockId"
              />
            </el-select>

            <el-input v-if="op.type === 'SET_CELL_TEXT'" v-model="op.text" placeholder="新文本" class="te__op-text" />

            <el-input
              v-else-if="op.type === 'INSERT_ROW_BEFORE' || op.type === 'INSERT_ROW_AFTER'"
              :model-value="(op.values ?? []).join(',')"
              placeholder="单元格内容，逗号分隔"
              class="te__op-text"
              @update:model-value="op.values = $event.split(',').map((s: string) => s.trim())"
            />

            <el-input-number
              v-else-if="op.type === 'SET_ROW_HEIGHT' || op.type === 'SET_COLUMN_WIDTH'"
              v-model="op.dimensionTwips"
              :min="1"
              :max="20000"
              class="te__op-num"
            />

            <el-select
              v-else-if="op.type === 'MERGE_CELLS'"
              v-model="op.endBlockId"
              class="te__op-target"
              filterable
              placeholder="右下单元格"
            >
              <el-option v-for="item in cells" :key="item.blockId" :label="item.blockId" :value="item.blockId" />
            </el-select>

            <el-checkbox v-else-if="op.type === 'REPEAT_HEADER_ROW'" v-model="op.repeatHeader">重复表头</el-checkbox>

            <el-button link type="danger" size="small" @click="removeOperation(index)">移除</el-button>
          </div>

          <div class="te__actions">
            <el-button size="small" @click="addOperation">添加操作</el-button>
            <span class="te__spacer" />
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
.te {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  max-height: 72vh;
  overflow-y: auto;
}

.te__hint {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink-soft;

  code {
    font-family: $font-serif;
  }
}

.te__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.te__table-select {
  width: 100%;
}

.te__preview {
  max-height: 30vh;
  overflow: auto;
  padding: $gap-xs;
  background-color: $paper-base;
  border: $border-w solid $line;
  border-radius: $radius;
}

.te__grid {
  border-collapse: collapse;
  font-size: $font-size-caption;

  td {
    padding: $gap-xs;
    vertical-align: top;
    border: $border-w solid $line;
    min-width: 90px;
  }
}

.te__cell-text {
  display: block;
  color: $ink;
}

.te__cell-id {
  display: block;
  margin-top: 2px;
  font-family: $font-serif;
  color: $ink-soft;
}

.te__ops {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  padding-top: $gap-sm;
  border-top: $border-w solid $line;
}

.te__op {
  display: flex;
  align-items: center;
  gap: $gap-xs;
}

.te__op-type {
  width: 165px;
}

.te__op-target {
  flex: 1;
  min-width: 0;
}

.te__op-text {
  flex: 1;
  min-width: 0;
}

.te__op-num {
  width: 130px;
}

.te__actions {
  display: flex;
  align-items: center;
  gap: $gap-sm;
  margin-top: $gap-xs;
}

.te__spacer {
  flex: 1;
}
</style>
