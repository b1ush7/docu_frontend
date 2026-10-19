<script setup lang="ts">
/**
 * @component XlsxEditor
 * @description XLSX 结构化查看与单元格编辑（API.md 3.13 / 3.17 / 3.19）。
 *
 * 本组件覆盖：
 *   - 结构浏览：工作表、单元格、合并区域（`GET .../xlsx/structure`）
 *   - 区域读取：指定 `sheetName + range` 的矩阵，含空白位（`GET .../xlsx/range`）
 *   - 公式即时计算：不保存版本（`GET .../xlsx/formula-results`）
 *   - 单元格编辑：SET_VALUE / SET_FORMULA / CLEAR（`POST .../xlsx/cell-edits`）
 *
 * 语义要点：
 *   - 编辑**绑定明确版本**，整批 operations 只创建一个新版本；
 *   - 单元格地址必须 A1 记法，区域必须 A1:C3 记法；
 *   - `SET_VALUE` 需要 valueType；`SET_FORMULA` 需要 formula；
 *   - 公式即时计算**不会**写回文件，只是预览计算结果。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { xlsxApi } from '@/api/xlsx'
import { ApiError } from '@/api/http'
import type {
  Version,
  XlsxCellEditOperation,
  XlsxFormulaResults,
  XlsxRange,
  XlsxStructure,
  XlsxValueType,
} from '@/api/types'

const props = defineProps<{
  modelValue: boolean
  fileId: number | null
  versionNo: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'edited', version: Version): void
}>()

/** 面板页签 */
const tab = ref<'browse' | 'range' | 'edit'>('browse')
const structure = ref<XlsxStructure | null>(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')

/* ---------- 区域读取与公式计算 ---------- */
const sheetName = ref('')
const rangeText = ref('A1:C10')
const rangeResult = ref<XlsxRange | null>(null)
const formulaResult = ref<XlsxFormulaResults | null>(null)

/* ---------- 单元格编辑 ---------- */
const ops = ref<XlsxCellEditOperation[]>([])

const sheets = computed(() => structure.value?.sheets ?? [])

async function load(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  loading.value = true
  error.value = ''
  structure.value = null
  try {
    structure.value = await xlsxApi.getStructure(props.fileId, props.versionNo)
    sheetName.value = structure.value.sheets[0]?.name ?? ''
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
    tab.value = 'browse'
    ops.value = []
    rangeResult.value = null
    formulaResult.value = null
    rangeText.value = 'A1:C10'
    void load()
  },
)

/** 读取区域（含空白位） */
async function loadRange(): Promise<void> {
  if (props.fileId === null || props.versionNo === null || !sheetName.value) return
  error.value = ''
  try {
    rangeResult.value = await xlsxApi.getRange(props.fileId, props.versionNo, sheetName.value, rangeText.value.trim())
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '区域读取失败'
  }
}

/** 即时计算公式（不写回文件） */
async function loadFormulas(): Promise<void> {
  if (props.fileId === null || props.versionNo === null || !sheetName.value) return
  error.value = ''
  try {
    formulaResult.value = await xlsxApi.calculateFormulas(
      props.fileId,
      props.versionNo,
      sheetName.value,
      rangeText.value.trim(),
    )
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '公式计算失败'
  }
}

/** 添加一条单元格操作 */
function addOp(): void {
  if (ops.value.length >= 500) {
    ElMessage.warning('单次最多 500 个单元格操作')
    return
  }
  ops.value.push({ type: 'SET_VALUE', sheetName: sheetName.value, cell: 'A1', valueType: 'STRING', value: '' })
}

function removeOp(index: number): void {
  ops.value.splice(index, 1)
}

/** 提交单元格编辑 */
async function submit(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  if (!ops.value.length) {
    ElMessage.warning('还没有添加任何操作')
    return
  }
  const invalid = ops.value.findIndex((op) => !op.sheetName || !op.cell)
  if (invalid >= 0) {
    ElMessage.warning(`第 ${invalid + 1} 条：工作表与单元格地址都必须填写`)
    return
  }
  if (ops.value.some((op) => op.type === 'SET_FORMULA' && !(op.formula ?? '').trim())) {
    ElMessage.warning('设置公式必须填写公式内容')
    return
  }
  submitting.value = true
  try {
    const version = await xlsxApi.editCells(props.fileId, props.versionNo, { operations: ops.value })
    ElMessage.success('已创建新版本')
    emit('edited', version)
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '提交失败'
  } finally {
    submitting.value = false
  }
}

const VALUE_TYPES: XlsxValueType[] = ['STRING', 'NUMBER', 'BOOLEAN', 'DATE']
</script>

<template>
  <div class="xe">
    <p v-if="error" class="xe__hint xe__hint--warn" role="alert">{{ error }}</p>
    <p v-if="loading" class="xe__hint">结构加载中…</p>

    <el-tabs v-if="structure" v-model="tab">
      <!-- 结构浏览 -->
      <el-tab-pane label="结构" name="browse">
        <p class="xe__hint">
          共 {{ structure.totalSheets }} 个工作表，{{ structure.includedCells }} 个单元格
          <template v-if="structure.truncated">（结果被截断）</template>
        </p>
        <el-collapse>
          <el-collapse-item v-for="sheet in sheets" :key="sheet.name" :title="`${sheet.name}（${sheet.cells.length} 个单元格）`">
            <p v-if="sheet.mergedRegions.length" class="xe__hint">合并区域：{{ sheet.mergedRegions.join('，') }}</p>
            <el-table :data="sheet.cells" size="small" border max-height="300">
              <el-table-column prop="address" label="单元格" width="90" />
              <el-table-column prop="type" label="类型" width="90" />
              <el-table-column prop="value" label="值" min-width="140" show-overflow-tooltip />
              <el-table-column prop="formula" label="公式" min-width="140" show-overflow-tooltip />
            </el-table>
          </el-collapse-item>
        </el-collapse>
      </el-tab-pane>

      <!-- 区域读取 / 公式计算 -->
      <el-tab-pane label="区域与公式" name="range">
        <div class="xe__row">
          <el-select v-model="sheetName" placeholder="工作表" class="xe__sheet">
            <el-option v-for="s in sheets" :key="s.name" :label="s.name" :value="s.name" />
          </el-select>
          <el-input v-model="rangeText" placeholder="A1:C10" class="xe__range" />
          <el-button size="small" @click="loadRange">读取区域</el-button>
          <el-button size="small" @click="loadFormulas">计算公式</el-button>
        </div>

        <template v-if="rangeResult">
          <p class="xe__hint">{{ rangeResult.sheetName }} · {{ rangeResult.range }} · {{ rangeResult.rowCount }}×{{ rangeResult.columnCount }}</p>
          <el-table :data="rangeResult.rows.map((row, i) => ({ i, row }))" size="small" border max-height="320">
            <el-table-column label="行" width="60">
              <template #default="{ row }">{{ rangeResult.firstRow + row.i }}</template>
            </el-table-column>
            <el-table-column label="值（按列）">
              <template #default="{ row }">
                {{ row.row.map((c: { value: string | null }) => c.value ?? '').join(' | ') }}
              </template>
            </el-table-column>
          </el-table>
        </template>

        <template v-if="formulaResult">
          <p class="xe__hint">公式即时计算（<strong>不写回文件</strong>）· {{ formulaResult.results.length }} 项</p>
          <el-table :data="formulaResult.results" size="small" border max-height="300">
            <el-table-column prop="address" label="单元格" width="90" />
            <el-table-column prop="formula" label="公式" min-width="160" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="130" />
            <el-table-column prop="value" label="结果" min-width="120" show-overflow-tooltip />
            <el-table-column prop="message" label="说明" min-width="140" show-overflow-tooltip />
          </el-table>
        </template>
      </el-tab-pane>

      <!-- 单元格编辑 -->
      <el-tab-pane label="单元格编辑" name="edit">
        <p class="xe__hint">
          整批操作<strong>只创建一个新版本</strong>；地址用 A1 记法（如 B2）。单次上限 500 条。
        </p>
        <div class="xe__list">
          <div v-for="(op, index) in ops" :key="index" class="xe__op">
            <el-select v-model="op.type" class="xe__op-type">
              <el-option label="设置值" value="SET_VALUE" />
              <el-option label="设置公式" value="SET_FORMULA" />
              <el-option label="清空" value="CLEAR" />
            </el-select>
            <el-select v-model="op.sheetName" class="xe__sheet" filterable placeholder="工作表">
              <el-option v-for="s in sheets" :key="s.name" :label="s.name" :value="s.name" />
            </el-select>
            <el-input v-model="op.cell" placeholder="B2" class="xe__cell" />
            <el-select v-if="op.type === 'SET_VALUE'" v-model="op.valueType" class="xe__type">
              <el-option v-for="t in VALUE_TYPES" :key="t" :label="t" :value="t" />
            </el-select>
            <el-input v-if="op.type === 'SET_VALUE'" v-model="op.value" placeholder="值" class="xe__value" />
            <el-input v-if="op.type === 'SET_FORMULA'" v-model="op.formula" placeholder="=SUM(A1:A3)" class="xe__value" />
            <el-button link type="danger" size="small" @click="removeOp(index)">移除</el-button>
          </div>
        </div>
        <div class="xe__actions">
          <el-button size="small" @click="addOp">添加操作</el-button>
          <span class="xe__spacer" />
          <el-button type="primary" size="small" :loading="submitting" :disabled="!ops.length" @click="submit">
            提交 {{ ops.length }} 条
          </el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.xe {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  min-height: 0;
  overflow-y: auto;
}

.xe__hint {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.xe__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.xe__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $gap-xs;
  margin-bottom: $gap-sm;
}

.xe__sheet {
  width: 160px;
}

.xe__range,
.xe__cell {
  width: 120px;
}

.xe__type {
  width: 120px;
}

.xe__op-type {
  width: 130px;
}

.xe__value {
  flex: 1;
  min-width: 0;
}

.xe__list {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  max-height: 42vh;
  overflow-y: auto;
}

.xe__op {
  display: flex;
  align-items: center;
  gap: $gap-xs;
  padding: $gap-xs;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
}

.xe__actions {
  display: flex;
  align-items: center;
  gap: $gap-sm;
  margin-top: $gap-sm;
}

.xe__spacer {
  flex: 1;
}
</style>
