<script setup lang="ts">
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-checkbox.css'
import 'element-plus/theme-chalk/el-collapse.css'
import 'element-plus/theme-chalk/el-collapse-item.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-input-number.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/el-option-group.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-tab-pane.css'
import 'element-plus/theme-chalk/el-tooltip.css'
import 'element-plus/theme-chalk/el-table.css'
import 'element-plus/theme-chalk/el-table-column.css'
import 'element-plus/theme-chalk/el-tabs.css'

import { ElButton, ElCheckbox, ElCollapse, ElCollapseItem, ElInput, ElInputNumber, ElOption, ElSelect, ElTabPane, ElTable, ElTableColumn, ElTabs } from 'element-plus'

import { useRequestGuard } from '@/composables/useRequestGuard'

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
  XlsxDataEditOperation,
  XlsxFormatOperation,
  XlsxFormulaResults,
  XlsxImageOperation,
  XlsxRange,
  XlsxSheetEditOperation,
  XlsxStructure,
  XlsxStructureEditOperation,
  XlsxValueType,
} from '@/api/types'

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

/** 面板页签 */
const tab = ref<'browse' | 'range' | 'edit' | 'sheet' | 'misc'>('browse')
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
  const isCurrent = requestGuard('load')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
  loading.value = true
  error.value = ''
  structure.value = null
  try {
    const structureResponse = await xlsxApi.getStructure(fileId, versionNo)
    if (!isCurrent()) return
    structure.value = structureResponse
    sheetName.value = structure.value.sheets[0]?.name ?? ''
  } catch (e) {
    if (!isCurrent()) return
    error.value = e instanceof ApiError ? e.message : '结构加载失败'
  } finally {
    if (isCurrent()) loading.value = false
  }
}

/** 读取区域（含空白位） */
async function loadRange(): Promise<void> {
  const isCurrent = requestGuard('loadRange')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null || !sheetName.value) return
  error.value = ''
  try {
    const rangeResultResponse = await xlsxApi.getRange(fileId, versionNo, sheetName.value, rangeText.value.trim())
    if (!isCurrent()) return
    rangeResult.value = rangeResultResponse
  } catch (e) {
    if (!isCurrent()) return
    error.value = e instanceof ApiError ? e.message : '区域读取失败'
  }
}

/** 即时计算公式（不写回文件） */
async function loadFormulas(): Promise<void> {
  const isCurrent = requestGuard('loadFormulas')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null || !sheetName.value) return
  error.value = ''
  try {
    const formulaResultResponse = await xlsxApi.calculateFormulas(
      fileId,
      versionNo,
      sheetName.value,
      rangeText.value.trim(),
    )
    if (!isCurrent()) return
    formulaResult.value = formulaResultResponse
  } catch (e) {
    if (!isCurrent()) return
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
  if (submitting.value) return
  const isCurrent = requestGuard('submit')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
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
    const version = await xlsxApi.editCells(fileId, versionNo, { operations: ops.value })
    if (!isCurrent()) return
    ElMessage.success('已创建新版本')
    emit('edited', version)
  } catch (e) {
    if (!isCurrent()) return
    error.value = e instanceof ApiError ? e.message : '提交失败'
  } finally {
    if (isCurrent()) submitting.value = false
  }
}

const VALUE_TYPES: XlsxValueType[] = ['STRING', 'NUMBER', 'BOOLEAN', 'DATE']

/* ---------- 数据 / 格式 / 图片（单条提交） ---------- */
const dataOp = ref<XlsxDataEditOperation>({ type: 'SORT_RANGE', sheetName: '', range: 'A1:C10' })
const formatOp = ref<XlsxFormatOperation>({ sheetName: '', range: 'A1:C10' })
const imageOp = ref<XlsxImageOperation>({
  sheetName: '',
  cell: 'A1',
  imageFileId: 0,
  imageVersionNo: 1,
  widthPixels: 200,
  heightPixels: 200,
})

/** 三个接口共用的一次性提交 */
async function submitMisc(kind: 'data' | 'format' | 'image'): Promise<void> {
  if (submitting.value) return
  const isCurrent = requestGuard('submitMisc')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
  let run: Promise<Version>
  if (kind === 'data') {
    if (!dataOp.value.sheetName || !dataOp.value.range) {
      ElMessage.warning('排序/筛选需要工作表与区域')
      return
    }
    run = xlsxApi.editData(fileId, versionNo, { operations: [dataOp.value] })
  } else if (kind === 'format') {
    if (!formatOp.value.sheetName || !formatOp.value.range) {
      ElMessage.warning('格式设置需要工作表与区域')
      return
    }
    run = xlsxApi.formatCells(fileId, versionNo, { operations: [formatOp.value] })
  } else {
    if (!imageOp.value.sheetName || !imageOp.value.cell || !imageOp.value.imageFileId) {
      ElMessage.warning('内嵌图片需要工作表、单元格与图片文件 ID')
      return
    }
    run = xlsxApi.insertImages(fileId, versionNo, { operations: [imageOp.value] })
  }
  submitting.value = true
  error.value = ''
  try {
    const version = await run
    if (!isCurrent()) return
    ElMessage.success('已创建新版本')
    emit('edited', version)
  } catch (e) {
    if (!isCurrent()) return
    error.value = e instanceof ApiError ? e.message : '提交失败'
  } finally {
    if (isCurrent()) submitting.value = false
  }
}

/* ---------- 行列编辑（structure-edits） ---------- */
const structOps = ref<XlsxStructureEditOperation[]>([])

function addStructOp(): void {
  structOps.value.push({ type: 'INSERT_ROWS', sheetName: sheetName.value, start: 1, count: 1 })
}

function removeStructOp(index: number): void {
  structOps.value.splice(index, 1)
}

async function submitStruct(): Promise<void> {
  if (submitting.value) return
  const isCurrent = requestGuard('submitStruct')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
  if (!structOps.value.length) {
    ElMessage.warning('还没有添加行列操作')
    return
  }
  submitting.value = true
  try {
    const version = await xlsxApi.editStructure(fileId, versionNo, {
      operations: structOps.value,
    })
    if (!isCurrent()) return
    ElMessage.success('已创建新版本')
    emit('edited', version)
  } catch (e) {
    if (!isCurrent()) return
    error.value = e instanceof ApiError ? e.message : '行列编辑失败'
  } finally {
    if (isCurrent()) submitting.value = false
  }
}

/* ---------- 工作表编辑（sheet-edits） ---------- */
const sheetOps = ref<XlsxSheetEditOperation[]>([])

function addSheetOp(): void {
  sheetOps.value.push({ type: 'CREATE', sheetName: '新工作表' })
}

function removeSheetOp(index: number): void {
  sheetOps.value.splice(index, 1)
}

async function submitSheet(): Promise<void> {
  if (submitting.value) return
  const isCurrent = requestGuard('submitSheet')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
  if (!sheetOps.value.length) {
    ElMessage.warning('还没有添加工作表操作')
    return
  }
  const bad = sheetOps.value.findIndex(
    (op) => !op.sheetName || (op.type === 'RENAME' && !(op.newName ?? '').trim()),
  )
  if (bad >= 0) {
    ElMessage.warning(`第 ${bad + 1} 条：工作表名必填，重命名需填新名称`)
    return
  }
  submitting.value = true
  try {
    const version = await xlsxApi.editSheets(fileId, versionNo, {
      operations: sheetOps.value,
    })
    if (!isCurrent()) return
    ElMessage.success('已创建新版本')
    emit('edited', version)
  } catch (e) {
    if (!isCurrent()) return
    error.value = e instanceof ApiError ? e.message : '工作表编辑失败'
  } finally {
    if (isCurrent()) submitting.value = false
  }
}
watch(
  () => [props.modelValue, props.fileId, props.versionNo] as const,
  ([visible]) => {
    structure.value = null
    loading.value = false
    submitting.value = false
    if (!visible) return
    tab.value = 'browse'
    ops.value = []
    structOps.value = []
    sheetOps.value = []
    sheetName.value = ''
    error.value = ''
    dataOp.value = { type: 'SORT_RANGE', sheetName: '', range: 'A1:C10' }
    formatOp.value = { sheetName: '', range: 'A1:C10' }
    imageOp.value = { sheetName: '', cell: 'A1', imageFileId: 0, imageVersionNo: 1, widthPixels: 200, heightPixels: 200 }
    rangeResult.value = null
    formulaResult.value = null
    rangeText.value = 'A1:C10'
    void load()
  },
  { immediate: true, flush: 'sync' },
)

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

      <!-- 行列与工作表 -->
      <el-tab-pane label="行列 / 工作表" name="sheet">
        <p class="xe__hint">
          行列操作从 <strong>1</strong> 开始；列操作中 <code>1</code> 表示 A 列。单次数量上限 1000。
        </p>
        <div class="xe__list">
          <div v-for="(op, index) in structOps" :key="index" class="xe__op">
            <el-select v-model="op.type" class="xe__op-type">
              <el-option label="插入行" value="INSERT_ROWS" />
              <el-option label="删除行" value="DELETE_ROWS" />
              <el-option label="插入列" value="INSERT_COLUMNS" />
              <el-option label="删除列" value="DELETE_COLUMNS" />
            </el-select>
            <el-select v-model="op.sheetName" class="xe__sheet" filterable placeholder="工作表">
              <el-option v-for="s in sheets" :key="s.name" :label="s.name" :value="s.name" />
            </el-select>
            <el-input-number v-model="op.start" :min="1" placeholder="起始" />
            <el-input-number v-model="op.count" :min="1" :max="1000" placeholder="数量" />
            <el-button link type="danger" size="small" @click="removeStructOp(index)">移除</el-button>
          </div>
        </div>
        <div class="xe__actions">
          <el-button size="small" @click="addStructOp">添加行列操作</el-button>
          <span class="xe__spacer" />
          <el-button type="primary" size="small" :loading="submitting" :disabled="!structOps.length" @click="submitStruct">
            提交 {{ structOps.length }} 条
          </el-button>
        </div>

        <p class="xe__hint" style="margin-top: 16px">
          工作表操作：CREATE 可指定插入位置（不填追加到末尾）；RENAME 需要新名称；DELETE 删除后不可恢复。
        </p>
        <div class="xe__list">
          <div v-for="(op, index) in sheetOps" :key="index" class="xe__op">
            <el-select v-model="op.type" class="xe__op-type">
              <el-option label="新建" value="CREATE" />
              <el-option label="重命名" value="RENAME" />
              <el-option label="删除" value="DELETE" />
            </el-select>
            <el-input v-model="op.sheetName" placeholder="工作表名" class="xe__sheet" />
            <el-input v-if="op.type === 'RENAME'" v-model="op.newName" placeholder="新名称" class="xe__sheet" />
            <el-input-number v-if="op.type === 'CREATE'" v-model="op.position" :min="1" placeholder="位置" />
            <el-button link type="danger" size="small" @click="removeSheetOp(index)">移除</el-button>
          </div>
        </div>
        <div class="xe__actions">
          <el-button size="small" @click="addSheetOp">添加工作表操作</el-button>
          <span class="xe__spacer" />
          <el-button type="primary" size="small" :loading="submitting" :disabled="!sheetOps.length" @click="submitSheet">
            提交 {{ sheetOps.length }} 条
          </el-button>
        </div>
      </el-tab-pane>

      <!-- 数据 / 格式 / 图片 -->
      <el-tab-pane label="数据 / 格式 / 图片" name="misc">
        <p class="xe__hint">三项各自单独提交，每次提交创建一个新版本。</p>

        <p class="xe__hint"><strong>排序与自动筛选</strong>（区域用 A1:C10 记法；排序列用 B 这样的列名）</p>
        <div class="xe__row">
          <el-select v-model="dataOp.type" class="xe__op-type">
            <el-option label="区域排序" value="SORT_RANGE" />
            <el-option label="设置自动筛选" value="SET_AUTO_FILTER" />
            <el-option label="清除自动筛选" value="CLEAR_AUTO_FILTER" />
          </el-select>
          <el-select v-model="dataOp.sheetName" class="xe__sheet" filterable placeholder="工作表">
            <el-option v-for="s in sheets" :key="s.name" :label="s.name" :value="s.name" />
          </el-select>
          <el-input v-model="dataOp.range" placeholder="A1:C10" class="xe__range" />
          <el-input v-if="dataOp.type === 'SORT_RANGE'" v-model="dataOp.keyColumn" placeholder="排序列 B" class="xe__cell" />
          <el-select v-if="dataOp.type === 'SORT_RANGE'" v-model="dataOp.direction" class="xe__type">
            <el-option label="升序" value="ASC" />
            <el-option label="降序" value="DESC" />
          </el-select>
          <el-checkbox v-if="dataOp.type === 'SORT_RANGE'" v-model="dataOp.hasHeader">首行为表头</el-checkbox>
          <el-button size="small" :loading="submitting" @click="submitMisc('data')">提交</el-button>
        </div>

        <p class="xe__hint"><strong>单元格格式</strong>（颜色用 6 位十六进制，可带 #）</p>
        <div class="xe__row">
          <el-select v-model="formatOp.sheetName" class="xe__sheet" filterable placeholder="工作表">
            <el-option v-for="s in sheets" :key="s.name" :label="s.name" :value="s.name" />
          </el-select>
          <el-input v-model="formatOp.range" placeholder="A1 或 A1:C3" class="xe__range" />
          <el-input v-model="formatOp.fontName" placeholder="字体名" class="xe__cell" />
          <el-input-number v-model="formatOp.fontSize" :min="1" :max="409" placeholder="字号" />
          <el-checkbox v-model="formatOp.bold">加粗</el-checkbox>
          <el-checkbox v-model="formatOp.italic">斜体</el-checkbox>
          <el-select v-model="formatOp.horizontalAlignment" class="xe__type" clearable placeholder="水平对齐">
            <el-option v-for="a in ['GENERAL','LEFT','CENTER','RIGHT','FILL','JUSTIFY','CENTER_SELECTION','DISTRIBUTED']" :key="a" :label="a" :value="a" />
          </el-select>
          <el-input v-model="formatOp.fillColor" placeholder="填充 #FFEEAA" class="xe__cell" />
          <el-input v-model="formatOp.numberFormat" placeholder="数字格式 0.00" class="xe__cell" />
          <el-select v-model="formatOp.borderStyle" class="xe__type" clearable placeholder="边框">
            <el-option v-for="b in ['NONE','THIN','MEDIUM','DASHED','DOTTED','THICK','DOUBLE']" :key="b" :label="b" :value="b" />
          </el-select>
          <el-button size="small" :loading="submitting" @click="submitMisc('format')">提交</el-button>
        </div>

        <p class="xe__hint"><strong>内嵌图片</strong>（图片须来自已有文件的明确版本；宽高 1～10000 像素）</p>
        <div class="xe__row">
          <el-select v-model="imageOp.sheetName" class="xe__sheet" filterable placeholder="工作表">
            <el-option v-for="s in sheets" :key="s.name" :label="s.name" :value="s.name" />
          </el-select>
          <el-input v-model="imageOp.cell" placeholder="锚点 A1" class="xe__cell" />
          <el-input-number v-model="imageOp.imageFileId" :min="1" placeholder="图片 fileId" />
          <el-input-number v-model="imageOp.imageVersionNo" :min="1" placeholder="版本" />
          <el-input-number v-model="imageOp.widthPixels" :min="1" :max="10000" placeholder="宽" />
          <el-input-number v-model="imageOp.heightPixels" :min="1" :max="10000" placeholder="高" />
          <el-button size="small" :loading="submitting" @click="submitMisc('image')">提交</el-button>
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
