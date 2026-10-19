<script setup lang="ts">
/**
 * @component ModelConfigsView
 * @description 模型配置管理（API.md 第 7 章 /admin/model-configs）。
 *
 * 三条必须体现在界面上的语义（来自后端实现）：
 *   1. **密钥只写不读**：列表只返回 `apiKeyConfigured` 与 `apiKeyMasked`，永远不回读明文；
 *      编辑时留空 `apiKey` 表示"保持原密钥不变"，不是清空。
 *   2. **新建默认停用**：创建后状态固定为 DISABLED，需要再点「启用」。
 *   3. **默认配置禁止删除**：需先把另一条设为默认，否则删除返回 409。
 *
 * 另：当前后端对话能力走 `res.ai.*` 环境变量，这套表驱动配置是为多模型路由预留的，
 * 改了不一定影响线上对话 —— 页面上要明确告诉管理员，避免误以为能立刻切换模型。
 */
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminModelConfigApi } from '@/api/model-config'
import { ApiError } from '@/api/http'
import { formatDateTime } from '@/utils/format'
import type {
  ModelConfig,
  ModelConfigQueryParams,
  ModelConfigScope,
  SaveModelConfigParams,
} from '@/api/types'

const rows = ref<ModelConfig[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')

const query = reactive<ModelConfigQueryParams>({ page: 1, size: 20, scope: undefined, status: undefined, keyword: '' })

const SCOPES: ModelConfigScope[] = ['TEXT', 'IMAGE', 'OCR']

/** 编辑对话框 */
const dialogVisible = ref(false)
/** 正在编辑的配置 ID；null 表示新建 */
const editingId = ref<number | null>(null)
const saving = ref(false)

/** 表单；apiKey 只在新建或主动替换时填写 */
const form = reactive<SaveModelConfigParams>({
  code: '',
  name: '',
  scope: 'TEXT',
  provider: '',
  baseUrl: '',
  modelName: '',
  apiKey: '',
  timeoutSeconds: undefined,
  maxOutputTokens: undefined,
  temperature: undefined,
  isDefault: false,
  remark: '',
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const page = await adminModelConfigApi.list({
      page: query.page,
      size: query.size,
      scope: query.scope,
      status: query.status,
      keyword: query.keyword?.trim() || undefined,
    })
    rows.value = page.records
    total.value = page.total
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '模型配置加载失败'
  } finally {
    loading.value = false
  }
}

function search(): void {
  query.page = 1
  void load()
}

/** 重置表单 */
function resetForm(): void {
  form.code = ''
  form.name = ''
  form.scope = 'TEXT'
  form.provider = ''
  form.baseUrl = ''
  form.modelName = ''
  form.apiKey = ''
  form.timeoutSeconds = undefined
  form.maxOutputTokens = undefined
  form.temperature = undefined
  form.isDefault = false
  form.remark = ''
}

/** 打开新建 */
function openCreate(): void {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

/** 打开编辑：回填元数据，密钥不回填 */
function openEdit(row: ModelConfig): void {
  editingId.value = row.id
  form.code = row.code
  form.name = row.name
  form.scope = row.scope
  form.provider = row.provider
  form.baseUrl = row.baseUrl ?? ''
  form.modelName = row.modelName
  form.apiKey = ''
  form.timeoutSeconds = row.timeoutSeconds ?? undefined
  form.maxOutputTokens = row.maxOutputTokens ?? undefined
  form.temperature = row.temperature ?? undefined
  form.isDefault = row.isDefault
  form.remark = row.remark ?? ''
  dialogVisible.value = true
}

/** 保存 */
async function save(): Promise<void> {
  if (!form.code.trim() || !form.name.trim() || !form.provider.trim() || !form.modelName.trim()) {
    ElMessage.warning('标识、名称、服务商、模型名都是必填')
    return
  }
  saving.value = true
  try {
    const payload: SaveModelConfigParams = {
      code: form.code.trim(),
      name: form.name.trim(),
      scope: form.scope,
      provider: form.provider.trim(),
      baseUrl: form.baseUrl?.trim() || undefined,
      modelName: form.modelName.trim(),
      // 留空表示保持原密钥不变（新建时留空则视为未配置）
      apiKey: form.apiKey?.trim() || undefined,
      timeoutSeconds: form.timeoutSeconds,
      maxOutputTokens: form.maxOutputTokens,
      temperature: form.temperature,
      isDefault: form.isDefault,
      remark: form.remark?.trim() || undefined,
    }
    if (editingId.value === null) await adminModelConfigApi.create(payload)
    else await adminModelConfigApi.update(editingId.value, payload)
    ElMessage.success(editingId.value === null ? '已创建（初始为停用）' : '已更新')
    dialogVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

/** 启用 / 停用 */
async function toggleStatus(row: ModelConfig): Promise<void> {
  const next = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  try {
    await adminModelConfigApi.setStatus(row.id, next)
    ElMessage.success(next === 'ENABLED' ? '已启用' : '已停用')
    await load()
  } catch (e) {
    // 未配置密钥时启用返回 409
    ElMessage.error(e instanceof ApiError ? e.message : '状态更新失败')
  }
}

/** 删除 */
async function remove(row: ModelConfig): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除配置「${row.name}」？`, '删除模型配置', { type: 'warning' })
  } catch {
    return
  }
  try {
    await adminModelConfigApi.remove(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    // 默认配置禁止删除（409），需要先把另一条设为默认
    ElMessage.error(e instanceof ApiError ? e.message : '删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="mc">
    <header class="mc__head">
      <h2 class="mc__title">模型配置</h2>
      <el-button type="primary" size="small" @click="openCreate">新建配置</el-button>
    </header>

    <p class="mc__hint">
      密钥只写不读：列表仅显示脱敏提示。新建后初始为<strong>停用</strong>，需要再点「启用」。
      当前对话能力由服务端 <code>res.ai.*</code> 环境变量决定，这里的配置为多模型路由预留。
    </p>

    <div class="mc__filters">
      <el-input v-model="query.keyword" placeholder="标识或名称" class="mc__w-md" clearable />
      <el-select v-model="query.scope" placeholder="用途" class="mc__w-sm" clearable>
        <el-option v-for="s in SCOPES" :key="s" :label="s" :value="s" />
      </el-select>
      <el-select v-model="query.status" placeholder="状态" class="mc__w-sm" clearable>
        <el-option label="ENABLED" value="ENABLED" />
        <el-option label="DISABLED" value="DISABLED" />
      </el-select>
      <el-button type="primary" size="small" :loading="loading" @click="search">查询</el-button>
    </div>

    <p v-if="error" class="mc__hint mc__hint--warn" role="alert">{{ error }}</p>

    <el-table :data="rows" size="small" border v-loading="loading" class="mc__table">
      <el-table-column prop="code" label="标识" width="150" show-overflow-tooltip />
      <el-table-column prop="name" label="名称" width="160" show-overflow-tooltip />
      <el-table-column prop="scope" label="用途" width="80" />
      <el-table-column prop="provider" label="服务商" width="110" show-overflow-tooltip />
      <el-table-column prop="modelName" label="模型" width="150" show-overflow-tooltip />
      <el-table-column label="密钥" width="150">
        <template #default="{ row }">
          <span v-if="row.apiKeyMasked">{{ row.apiKeyMasked }}</span>
          <span v-else-if="row.apiKeyConfigured">已配置（不可解密）</span>
          <span v-else class="mc__muted">未配置</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'ENABLED' ? 'success' : 'info'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="默认" width="70">
        <template #default="{ row }">{{ row.isDefault ? '是' : '-' }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link size="small" @click="toggleStatus(row)">
            {{ row.status === 'ENABLED' ? '停用' : '启用' }}
          </el-button>
          <el-button link size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="mc__pager"
      background
      layout="total, sizes, prev, pager, next"
      :total="total"
      :current-page="query.page"
      :page-size="query.size"
      :page-sizes="[20, 50, 100]"
      @current-change="(p: number) => { query.page = p; void load() }"
      @size-change="(s: number) => { query.size = s; query.page = 1; void load() }"
    />

    <el-dialog
      v-model="dialogVisible"
      append-to-body
      :title="editingId === null ? '新建模型配置' : '编辑模型配置'"
      width="620px"
      :close-on-click-modal="false"
    >
      <div class="mc__form">
        <label class="mc__field"><span>标识</span><el-input v-model="form.code" placeholder="字母数字下划线连字符，≤64" /></label>
        <label class="mc__field"><span>名称</span><el-input v-model="form.name" placeholder="≤128" /></label>
        <label class="mc__field">
          <span>用途</span>
          <el-select v-model="form.scope" class="mc__control">
            <el-option v-for="s in SCOPES" :key="s" :label="s" :value="s" />
          </el-select>
        </label>
        <label class="mc__field"><span>服务商</span><el-input v-model="form.provider" placeholder="如 openai / dashscope，≤32" /></label>
        <label class="mc__field"><span>接口地址</span><el-input v-model="form.baseUrl" placeholder="OpenAI 兼容端点，≤512" /></label>
        <label class="mc__field"><span>模型名</span><el-input v-model="form.modelName" placeholder="如 qwen-plus，≤128" /></label>
        <label class="mc__field">
          <span>API Key{{ editingId === null ? '' : '（留空表示不修改）' }}</span>
          <el-input v-model="form.apiKey" type="password" show-password placeholder="只在写入时接收，永远不会回读" />
        </label>
        <label class="mc__field"><span>超时秒数（1～600）</span><el-input-number v-model="form.timeoutSeconds" :min="1" :max="600" /></label>
        <label class="mc__field"><span>输出上限 tokens</span><el-input-number v-model="form.maxOutputTokens" :min="1" :max="1000000" /></label>
        <label class="mc__field"><span>温度（0～2）</span><el-input-number v-model="form.temperature" :min="0" :max="2" :step="0.1" :precision="2" /></label>
        <label class="mc__field mc__field--row"><el-checkbox v-model="form.isDefault">设为该用途下的默认配置</el-checkbox></label>
        <label class="mc__field"><span>备注</span><el-input v-model="form.remark" placeholder="≤255" /></label>
      </div>
      <template #footer>
        <el-button size="small" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.mc {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  padding: $card-padding;
}

.mc__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mc__title {
  margin: 0;
  font-size: $font-size-title;
  font-weight: $weight-semibold;
}

.mc__hint {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink-soft;

  code {
    font-family: $font-serif;
  }
}

.mc__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.mc__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $gap-xs;
}

.mc__w-md,
.mc__w-md :deep(.el-input__wrapper) {
  width: 200px;
}

.mc__w-sm,
.mc__w-sm :deep(.el-input__wrapper) {
  width: 140px;
}

.mc__table {
  width: 100%;
}

.mc__pager {
  align-self: flex-end;
}

.mc__muted {
  color: $ink-soft;
}

.mc__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $gap-sm;
  max-height: 60vh;
  overflow-y: auto;
}

.mc__field {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.mc__field--row {
  flex-direction: row;
  align-items: center;
}

.mc__control {
  width: 100%;
}
</style>
