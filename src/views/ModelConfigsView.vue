<template>
  <div class="page-card">
    <div class="filter-bar">
      <el-select v-model="filters.scope" placeholder="用途" clearable style="width: 130px">
        <el-option v-for="(v, k) in MODEL_SCOPE" :key="k" :label="v.label" :value="k" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px">
        <el-option label="已启用" value="ENABLED" />
        <el-option label="已停用" value="DISABLED" />
      </el-select>
      <el-input
        v-model="filters.keyword"
        placeholder="按标识或名称搜索"
        clearable
        style="width: 200px"
        @keyup.enter="onSearch"
      />
      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="onReset">重置</el-button>
      <div style="flex: 1"></div>
      <el-button type="primary" @click="openCreate">新增配置</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border stripe>
      <el-table-column prop="code" label="标识" min-width="120" show-overflow-tooltip />
      <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
      <el-table-column label="用途" width="100">
        <template #default="{ row }">
          <el-tag :type="enumTag(MODEL_SCOPE, row.scope)" size="small">
            {{ enumLabel(MODEL_SCOPE, row.scope) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="provider" label="服务商" min-width="130" show-overflow-tooltip />
      <el-table-column prop="modelName" label="模型" min-width="120" show-overflow-tooltip />
      <el-table-column label="Base URL" min-width="180">
        <template #default="{ row }">
          <el-tooltip v-if="row.baseUrl" :content="row.baseUrl" placement="top" effect="dark">
            <span style="cursor: default">{{ truncate(row.baseUrl, 28) }}</span>
          </el-tooltip>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="timeoutSeconds" label="超时(秒)" width="85" />
      <el-table-column prop="maxOutputTokens" label="最大Tokens" width="95" />
      <el-table-column prop="temperature" label="温度" width="70">
        <template #default="{ row }">{{ row.temperature ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="enumTag(CONFIG_STATUS, row.status)" size="small">
            {{ enumLabel(CONFIG_STATUS, row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="默认" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.isDefault" type="danger" size="small">默认</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="API Key" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.apiKeyConfigured" type="success" size="small">已配置</el-tag>
          <el-tag v-else type="warning" size="small">未配置</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="165">
        <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            link
            :type="row.status === 'ENABLED' ? 'warning' : 'success'"
            size="small"
            :loading="operating.has(row.id)"
            @click="onToggleStatus(row)"
          >
            {{ row.status === 'ENABLED' ? '停用' : '启用' }}
          </el-button>
          <el-button
            link
            type="danger"
            size="small"
            :loading="operating.has(row.id)"
            @click="onDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
      <template #empty>暂无模型配置</template>
    </el-table>

    <div class="table-footer">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="size"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @size-change="onSizeChange"
        @current-change="onPageChange"
      />
    </div>

    <!-- 详情（只读） -->
    <el-dialog v-model="detailVisible" title="配置详情" width="620px">
      <div v-loading="detailLoading">
        <el-descriptions v-if="detail" :column="2" border size="small">
          <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="标识">{{ detail.code }}</el-descriptions-item>
          <el-descriptions-item label="名称">{{ detail.name }}</el-descriptions-item>
          <el-descriptions-item label="用途">
            <el-tag :type="enumTag(MODEL_SCOPE, detail.scope)" size="small">
              {{ enumLabel(MODEL_SCOPE, detail.scope) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="服务商">{{ detail.provider || '-' }}</el-descriptions-item>
          <el-descriptions-item label="模型">{{ detail.modelName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Base URL" :span="2">{{ detail.baseUrl || '-' }}</el-descriptions-item>
          <el-descriptions-item label="超时时间">{{ detail.timeoutSeconds ?? '-' }} 秒</el-descriptions-item>
          <el-descriptions-item label="最大输出 Tokens">{{ detail.maxOutputTokens ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="温度">{{ detail.temperature ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="enumTag(CONFIG_STATUS, detail.status)" size="small">
              {{ enumLabel(CONFIG_STATUS, detail.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="是否默认">{{ detail.isDefault ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="API Key">
            <el-tag v-if="detail.apiKeyConfigured" type="success" size="small">已配置</el-tag>
            <el-tag v-else type="warning" size="small">未配置</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="API Key（脱敏）" :span="2">{{ detail.apiKeyMasked || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(detail.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDateTime(detail.updateTime) }}</el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 新增 / 编辑共用表单 -->
    <el-dialog
      v-model="formVisible"
      :title="formMode === 'create' ? '新增配置' : '编辑配置'"
      width="640px"
      :close-on-click-modal="false"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="130px">
        <el-form-item label="标识 code" prop="code">
          <el-input v-model="form.code" :disabled="formMode === 'edit'" placeholder="唯一标识，如 default-text" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="配置名称" />
        </el-form-item>
        <el-form-item label="用途" prop="scope">
          <el-select v-model="form.scope" placeholder="请选择用途" style="width: 100%">
            <el-option v-for="(v, k) in MODEL_SCOPE" :key="k" :label="v.label" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="服务商" prop="provider">
          <el-select v-model="form.provider" placeholder="请选择服务商" style="width: 100%">
            <el-option v-for="p in MODEL_PROVIDERS" :key="p.value" :label="p.label" :value="p.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="Base URL" prop="baseUrl">
          <el-input v-model="form.baseUrl" placeholder="https://api.example.com/v1" />
        </el-form-item>
        <el-form-item label="模型名称" prop="modelName">
          <el-input v-model="form.modelName" placeholder="如 qwen-plus" />
        </el-form-item>
        <!-- 密钥只写不读：编辑时输入框保持空，placeholder 展示脱敏值，绝不回填提交 -->
        <el-form-item label="API Key" prop="apiKey">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="apiKeyPlaceholder"
          />
          <div style="font-size: 12px; color: #909399; line-height: 1.6; margin-top: 4px">
            <template v-if="formMode === 'create'">留空的配置无法启用，可在创建后补充。</template>
            <template v-else>留空即保持原密钥不变。</template>
          </div>
        </el-form-item>
        <el-form-item label="超时时间(秒)" prop="timeoutSeconds">
          <el-input-number v-model="form.timeoutSeconds" :min="10" :max="3600" style="width: 180px" />
        </el-form-item>
        <el-form-item label="最大输出Tokens" prop="maxOutputTokens">
          <el-input-number v-model="form.maxOutputTokens" :min="1" :max="32000" style="width: 180px" />
        </el-form-item>
        <el-form-item label="温度" prop="temperature">
          <el-input-number
            v-model="form.temperature"
            :min="0"
            :max="2"
            :step="0.01"
            :precision="2"
            style="width: 180px"
          />
        </el-form-item>
        <el-form-item label="设为默认" prop="isDefault">
          <el-switch v-model="form.isDefault" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          {{ formMode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getModelConfigs,
  getModelConfigDetail,
  createModelConfig,
  updateModelConfig,
  updateModelConfigStatus,
  deleteModelConfig,
} from '../api/admin'
import { formatDateTime, truncate } from '../utils/format'
import { MODEL_SCOPE, CONFIG_STATUS, MODEL_PROVIDERS, enumLabel, enumTag } from '../constants/enums'

const rows = ref([])
const loading = ref(false)
const page = ref(1)
const size = ref(20)
const total = ref(0)
const filters = reactive({ scope: '', status: '', keyword: '' })

const operating = reactive(new Set())

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

const formVisible = ref(false)
const formMode = ref('create')
const editingId = ref(null)
const submitting = ref(false)
const formRef = ref()
// 编辑时展示的脱敏密钥（仅用于 placeholder，绝不回填输入框）
const editingMasked = ref('')

const defaultForm = () => ({
  code: '',
  name: '',
  scope: '',
  provider: '',
  baseUrl: '',
  modelName: '',
  apiKey: '',
  timeoutSeconds: 60,
  maxOutputTokens: 2048,
  temperature: 0.7,
  isDefault: false,
  remark: '',
})
const form = reactive(defaultForm())

const rules = {
  code: [{ required: true, message: '请输入标识', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  scope: [{ required: true, message: '请选择用途', trigger: 'change' }],
  provider: [{ required: true, message: '请选择服务商', trigger: 'change' }],
  baseUrl: [
    { required: true, message: '请输入 Base URL', trigger: 'blur' },
    { pattern: /^https?:\/\//, message: 'Base URL 需以 http:// 或 https:// 开头', trigger: 'blur' },
  ],
  modelName: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
  timeoutSeconds: [{ required: true, message: '请设置超时时间', trigger: 'change' }],
  maxOutputTokens: [{ required: true, message: '请设置最大输出 Tokens', trigger: 'change' }],
  temperature: [{ required: true, message: '请设置温度', trigger: 'change' }],
}

const apiKeyPlaceholder = computed(() => {
  if (formMode.value === 'create') return '选填，留空的配置无法启用'
  // 编辑：placeholder 展示当前脱敏值，输入框本体保持为空
  return editingMasked.value || '留空即保持原密钥不变'
})

function buildParams() {
  const params = { page: page.value, size: size.value }
  if (filters.scope) params.scope = filters.scope
  if (filters.status) params.status = filters.status
  if (filters.keyword?.trim()) params.keyword = filters.keyword.trim()
  return params
}

async function loadList() {
  loading.value = true
  try {
    const res = await getModelConfigs(buildParams())
    rows.value = res.data.records || []
    total.value = res.data.total || 0
  } catch {
    // 错误提示已由 request 统一处理
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  loadList()
}

function onReset() {
  filters.scope = ''
  filters.status = ''
  filters.keyword = ''
  page.value = 1
  loadList()
}

function onSizeChange() {
  page.value = 1
  loadList()
}

function onPageChange() {
  loadList()
}

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const res = await getModelConfigDetail(row.id)
    detail.value = res.data
  } catch {
    // msg 已由 request 展示
  } finally {
    detailLoading.value = false
  }
}

function openCreate() {
  formMode.value = 'create'
  editingId.value = null
  editingMasked.value = ''
  formVisible.value = true
}

function openEdit(row) {
  formMode.value = 'edit'
  editingId.value = row.id
  editingMasked.value = row.apiKeyMasked || ''
  Object.assign(form, {
    code: row.code,
    name: row.name,
    scope: row.scope,
    provider: row.provider,
    baseUrl: row.baseUrl,
    modelName: row.modelName,
    apiKey: '',
    timeoutSeconds: row.timeoutSeconds ?? 60,
    maxOutputTokens: row.maxOutputTokens ?? 2048,
    temperature: row.temperature ?? 0.7,
    isDefault: !!row.isDefault,
    remark: row.remark || '',
  })
  formVisible.value = true
}

function resetForm() {
  Object.assign(form, defaultForm())
  formRef.value?.clearValidate()
}

async function submitForm() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    const payload = { ...form }
    // 空 = 不设置/不修改密钥；严禁用 masked 值回填提交
    if (!payload.apiKey) delete payload.apiKey
    if (formMode.value === 'create') {
      await createModelConfig(payload)
      ElMessage.success('配置已创建，当前状态为已停用，需设置有效 API Key 后再启用。')
    } else {
      await updateModelConfig(editingId.value, payload)
      ElMessage.success('配置已更新')
    }
    formVisible.value = false
    loadList()
  } catch {
    // msg 已由 request 展示
  } finally {
    submitting.value = false
  }
}

async function onToggleStatus(row) {
  const target = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  const action = target === 'ENABLED' ? '启用' : '停用'
  try {
    await ElMessageBox.confirm(`确认${action}配置「${row.name}」？`, `${action}确认`, {
      type: 'warning',
      confirmButtonText: `确认${action}`,
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  operating.add(row.id)
  try {
    await updateModelConfigStatus(row.id, target)
    ElMessage.success(`已${action}`)
    loadList()
  } catch {
    // 409 等 msg 已由 request 默认展示
  } finally {
    operating.delete(row.id)
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除配置「${row.name}」（${row.code}）？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  operating.add(row.id)
  try {
    await deleteModelConfig(row.id)
    ElMessage.success('配置已删除')
    loadList()
  } catch {
    // 409 等 msg 已由 request 默认展示
  } finally {
    operating.delete(row.id)
  }
}

onMounted(loadList)
</script>
