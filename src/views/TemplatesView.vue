<script setup lang="ts">
/**
 * @component TemplatesView
 * @description 公共模板管理（API.md 7.12 / 7.13）。
 *
 * 语义要点（来自后端实现）：
 *   1. 模板文件走 multipart 的 `file` 字段，元数据作为同一表单的普通字段提交。
 *   2. `versionNo` 只在**替换文件或恢复历史版本**时递增，修改元数据不递增。
 *   3. `hasFile=false` 的模板不能用于生成文档，列表里要显式标出。
 *   4. `variables` 是 JSON 数组字符串，格式
 *      `[{"name":"title","label":"标题","required":true}]`，仅 name 必填且须匹配 `^[A-Za-z_][A-Za-z0-9_]*$`。
 *   5. 恢复历史版本需要 `expectVersion`（乐观锁），与当前内容版本不一致时后端返回 409。
 */
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminTemplateApi } from '@/api/template'
import { ApiError } from '@/api/http'
import { saveBlob } from '@/utils/download'
import { formatDateTime } from '@/utils/format'
import type {
  DocTemplate,
  DocTemplateQueryParams,
  DocTemplateVersion,
  SaveDocTemplateParams,
  TemplateVersionQueryParams,
} from '@/api/types'

/* ---------------- 列表 ---------------- */

const rows = ref<DocTemplate[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')

const query = reactive<DocTemplateQueryParams>({
  page: 1,
  size: 20,
  keyword: '',
  enabled: undefined,
  category: '',
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const page = await adminTemplateApi.list({
      page: query.page,
      size: query.size,
      keyword: query.keyword?.trim() || undefined,
      enabled: query.enabled,
      category: query.category?.trim() || undefined,
    })
    rows.value = page.records
    total.value = page.total
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '模板列表加载失败'
  } finally {
    loading.value = false
  }
}

function search(): void {
  query.page = 1
  void load()
}

/* ---------------- 新建 / 编辑 ---------------- */

const formVisible = ref(false)
/** null 表示新建 */
const editingId = ref<number | null>(null)
const saving = ref(false)
const form = reactive<SaveDocTemplateParams>({
  code: '',
  name: '',
  category: '',
  description: '',
  variables: '',
})
/** 新建时选择的模板文件 */
const formFile = ref<File | null>(null)

function resetForm(): void {
  form.code = ''
  form.name = ''
  form.category = ''
  form.description = ''
  form.variables = ''
  formFile.value = null
}

function openCreate(): void {
  editingId.value = null
  resetForm()
  formVisible.value = true
}

function openEdit(row: DocTemplate): void {
  editingId.value = row.id
  form.code = row.code
  form.name = row.name
  form.category = row.category ?? ''
  form.description = row.description ?? ''
  form.variables = row.variables ?? ''
  formFile.value = null
  formVisible.value = true
}

/** 校验 variables 是否为合法 JSON 数组（后端也会校验，这里提前拦住体验更好） */
function variablesValid(): string | null {
  const raw = (form.variables ?? '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return '变量定义必须是 JSON 数组'
    for (const [index, item] of parsed.entries()) {
      if (!item || typeof item !== 'object') return `第 ${index + 1} 个变量不是对象`
      if (typeof item.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.name)) {
        return `第 ${index + 1} 个变量的 name 不合法（字母/数字/下划线，不能以数字开头）`
      }
    }
    return null
  } catch {
    return '变量定义不是合法 JSON'
  }
}

async function save(): Promise<void> {
  if (!form.code.trim() || !form.name.trim()) {
    ElMessage.warning('标识与名称必填')
    return
  }
  const invalid = variablesValid()
  if (invalid) {
    ElMessage.warning(invalid)
    return
  }
  const payload: SaveDocTemplateParams = {
    code: form.code.trim(),
    name: form.name.trim(),
    category: form.category?.trim() || undefined,
    description: form.description?.trim() || undefined,
    variables: form.variables?.trim() || undefined,
  }
  saving.value = true
  try {
    if (editingId.value === null) {
      const file = formFile.value
      if (!file) {
        ElMessage.warning('新建模板必须选择 DOCX 文件')
        saving.value = false
        return
      }
      await adminTemplateApi.create(payload, file)
      ElMessage.success('模板已创建（初始为停用）')
    } else {
      await adminTemplateApi.update(editingId.value, payload)
      ElMessage.success('元数据已更新（内容版本号不变）')
    }
    formVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

/* ---------------- 单行操作 ---------------- */

/** 启用 / 停用 */
async function toggleEnabled(row: DocTemplate): Promise<void> {
  try {
    await adminTemplateApi.setEnabled(row.id, !row.enabled)
    ElMessage.success(row.enabled ? '已停用' : '已启用')
    await load()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '状态更新失败')
  }
}

/** 删除 */
async function remove(row: DocTemplate): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除模板「${row.name}」？`, '删除模板', { type: 'warning' })
  } catch {
    return
  }
  try {
    await adminTemplateApi.remove(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '删除失败')
  }
}

/** 下载当前文件 */
async function download(row: DocTemplate): Promise<void> {
  try {
    const blob = await adminTemplateApi.download(row.id)
    saveBlob(blob, row.originalName || `${row.code}.docx`)
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '下载失败')
  }
}

/** 替换文件（恢复/上传新内容，会递增内容版本号） */
const replacing = ref<number | null>(null)
async function replaceContent(row: DocTemplate): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.docx'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    replacing.value = row.id
    try {
      await adminTemplateApi.replaceContent(row.id, file)
      ElMessage.success('内容已替换（版本号已递增）')
      await load()
    } catch (e) {
      ElMessage.error(e instanceof ApiError ? e.message : '替换失败')
    } finally {
      replacing.value = null
    }
  }
  input.click()
}

/* ---------------- 内容版本 ---------------- */

const versionVisible = ref(false)
const versionLoading = ref(false)
const versionRows = ref<DocTemplateVersion[]>([])
const versionTotal = ref(0)
const versionQuery = reactive<TemplateVersionQueryParams>({ page: 1, size: 20 })
/** 当前查看版本的模板（恢复时需要它的 versionNo 作 expectVersion） */
const versionTemplate = ref<DocTemplate | null>(null)

async function openVersions(row: DocTemplate): Promise<void> {
  versionTemplate.value = row
  versionQuery.page = 1
  versionVisible.value = true
  await loadVersions()
}

async function loadVersions(): Promise<void> {
  const template = versionTemplate.value
  if (!template) return
  versionLoading.value = true
  try {
    const page = await adminTemplateApi.listVersions(template.id, {
      page: versionQuery.page,
      size: versionQuery.size,
    })
    versionRows.value = page.records
    versionTotal.value = page.total
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '版本列表加载失败')
  } finally {
    versionLoading.value = false
  }
}

async function downloadVersion(row: DocTemplateVersion): Promise<void> {
  const template = versionTemplate.value
  if (!template) return
  try {
    const blob = await adminTemplateApi.downloadVersion(template.id, row.versionNo)
    saveBlob(blob, row.originalName || `${template.code}-v${row.versionNo}.docx`)
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '下载失败')
  }
}

/** 恢复到某个内容版本：expectVersion 用模板当前 versionNo 做乐观锁 */
async function restoreVersion(row: DocTemplateVersion): Promise<void> {
  const template = versionTemplate.value
  if (!template) return
  try {
    await ElMessageBox.confirm(
      `恢复到 v${row.versionNo}？会创建一个新的内容版本，不覆盖历史。`,
      '恢复模板版本',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    const updated = await adminTemplateApi.restoreVersion(template.id, row.versionNo, template.versionNo)
    versionTemplate.value = updated
    ElMessage.success('已恢复（生成新的内容版本）')
    await Promise.all([load(), loadVersions()])
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '恢复失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="tpl">
    <header class="tpl__head">
      <h2 class="tpl__title">模板管理</h2>
      <el-button type="primary" size="small" @click="openCreate">新建模板</el-button>
    </header>

    <p class="tpl__hint">
      模板文件通过 multipart 的 <code>file</code> 字段提交；<strong>替换文件或恢复历史版本才会递增版本号</strong>，
      改元数据不影响版本。无文件（hasFile=false）的模板不能用于生成文档。
    </p>

    <div class="tpl__filters">
      <el-input v-model="query.keyword" placeholder="标识或名称" class="tpl__w-md" clearable />
      <el-input v-model="query.category" placeholder="分类" class="tpl__w-sm" clearable />
      <el-select v-model="query.enabled" placeholder="启用状态" class="tpl__w-sm" clearable>
        <el-option label="已启用" value="true" />
        <el-option label="已停用" value="false" />
      </el-select>
      <el-button type="primary" size="small" :loading="loading" @click="search">查询</el-button>
    </div>

    <p v-if="error" class="tpl__hint tpl__hint--warn" role="alert">{{ error }}</p>

    <el-table :data="rows" size="small" border v-loading="loading" class="tpl__table">
      <el-table-column prop="code" label="标识" width="130" show-overflow-tooltip />
      <el-table-column prop="name" label="名称" width="150" show-overflow-tooltip />
      <el-table-column prop="category" label="分类" width="100" show-overflow-tooltip />
      <el-table-column label="内容版本" width="90">
        <template #default="{ row }">v{{ row.versionNo }}</template>
      </el-table-column>
      <el-table-column label="文件" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.hasFile" size="small" type="success">已上传</el-tag>
          <el-tag v-else size="small" type="danger">缺失</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="330" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link size="small" @click="openVersions(row)">版本</el-button>
          <el-button link size="small" :disabled="!row.hasFile" :loading="replacing === row.id" @click="replaceContent(row)">换文件</el-button>
          <el-button link size="small" :disabled="!row.hasFile" @click="download(row)">下载</el-button>
          <el-button link size="small" @click="toggleEnabled(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
          <el-button link size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="tpl__pager"
      background
      layout="total, sizes, prev, pager, next"
      :total="total"
      :current-page="query.page"
      :page-size="query.size"
      :page-sizes="[20, 50, 100]"
      @current-change="(p: number) => { query.page = p; void load() }"
      @size-change="(s: number) => { query.size = s; query.page = 1; void load() }"
    />

    <!-- 新建 / 编辑 -->
    <el-dialog
      v-model="formVisible"
      append-to-body
      :title="editingId === null ? '新建模板' : '编辑模板元数据'"
      width="640px"
      :close-on-click-modal="false"
    >
      <div class="tpl__form">
        <label class="tpl__field"><span>标识（字母数字下划线连字符，≤64）</span><el-input v-model="form.code" :disabled="editingId !== null" /></label>
        <label class="tpl__field"><span>名称（≤128）</span><el-input v-model="form.name" /></label>
        <label class="tpl__field"><span>分类（≤32）</span><el-input v-model="form.category" /></label>
        <label class="tpl__field"><span>用途说明（≤500）</span><el-input v-model="form.description" type="textarea" :rows="2" /></label>
        <label class="tpl__field">
          <span>变量定义（JSON 数组，可留空）</span>
          <el-input
            v-model="form.variables"
            type="textarea"
            :rows="4"
            placeholder='[{"name":"title","label":"标题","required":true}]'
          />
        </label>
        <label v-if="editingId === null" class="tpl__field">
          <span>模板文件（DOCX，必选）</span>
          <input type="file" accept=".docx" @change="formFile = ($event.target as HTMLInputElement).files?.[0] ?? null" />
        </label>
        <p v-else class="tpl__hint">替换文件请用列表里的「换文件」，它会递增内容版本号。</p>
      </div>
      <template #footer>
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button type="primary" size="small" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 内容版本 -->
    <el-dialog
      v-model="versionVisible"
      append-to-body
      :title="`内容版本${versionTemplate ? ' · ' + versionTemplate.name : ''}`"
      width="720px"
    >
      <p class="tpl__hint">
        恢复历史版本会<strong>创建新的内容版本</strong>，不覆盖历史；乐观锁用当前 v{{ versionTemplate?.versionNo }}。
      </p>
      <el-table :data="versionRows" size="small" border v-loading="versionLoading">
        <el-table-column label="版本" width="80">
          <template #default="{ row }">v{{ row.versionNo }}</template>
        </el-table-column>
        <el-table-column prop="originalName" label="文件名" min-width="160" show-overflow-tooltip />
        <el-table-column prop="changeType" label="变更" width="100" />
        <el-table-column label="来源版本" width="90">
          <template #default="{ row }">{{ row.restoredFromVersion ? 'v' + row.restoredFromVersion : '-' }}</template>
        </el-table-column>
        <el-table-column label="大小" width="90">
          <template #default="{ row }">{{ row.sizeBytes ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" @click="downloadVersion(row)">下载</el-button>
            <el-button link size="small" @click="restoreVersion(row)">恢复</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        class="tpl__pager"
        background
        layout="total, prev, pager, next"
        :total="versionTotal"
        :current-page="versionQuery.page"
        :page-size="versionQuery.size"
        @current-change="(p: number) => { versionQuery.page = p; void loadVersions() }"
      />
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.tpl {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  padding: $card-padding;
}

.tpl__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tpl__title {
  margin: 0;
  font-size: $font-size-title;
  font-weight: $weight-semibold;
}

.tpl__hint {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink-soft;

  code {
    font-family: $font-serif;
  }
}

.tpl__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.tpl__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $gap-xs;
}

.tpl__w-md,
.tpl__w-md :deep(.el-input__wrapper) {
  width: 200px;
}

.tpl__w-sm,
.tpl__w-sm :deep(.el-input__wrapper) {
  width: 140px;
}

.tpl__table {
  width: 100%;
}

.tpl__pager {
  align-self: flex-end;
}

.tpl__form {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  max-height: 62vh;
  overflow-y: auto;
}

.tpl__field {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  font-size: $font-size-caption;
  color: $ink-soft;
}
</style>
