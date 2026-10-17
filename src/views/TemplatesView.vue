<template>
  <div class="page-card">
    <div class="filter-bar">
      <el-select v-model="filters.enabled" placeholder="启用状态" style="width: 120px">
        <el-option label="全部" value="" />
        <el-option label="已启用" :value="true" />
        <el-option label="未启用" :value="false" />
      </el-select>
      <el-select v-model="filters.category" placeholder="分类" style="width: 130px">
        <el-option label="全部" value="" />
        <el-option v-for="c in TEMPLATE_CATEGORIES" :key="c" :label="c" :value="c" />
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
      <el-button type="primary" @click="openCreate">新增模板</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border stripe>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="code" label="标识" min-width="110" show-overflow-tooltip />
      <el-table-column prop="name" label="名称" min-width="110" show-overflow-tooltip />
      <el-table-column prop="category" label="分类" width="90">
        <template #default="{ row }">{{ row.category || '-' }}</template>
      </el-table-column>
      <el-table-column label="描述" min-width="140">
        <template #default="{ row }">
          <el-tooltip v-if="row.description" :content="row.description" placement="top" effect="dark">
            <span style="cursor: default">{{ truncate(row.description, 20) }}</span>
          </el-tooltip>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="originalName" label="原始文件名" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.originalName || '-' }}</template>
      </el-table-column>
      <el-table-column prop="extension" label="格式" width="70">
        <template #default="{ row }">{{ row.extension || '-' }}</template>
      </el-table-column>
      <el-table-column label="大小" width="90">
        <template #default="{ row }">{{ formatBytes(row.sizeBytes) }}</template>
      </el-table-column>
      <el-table-column prop="versionNo" label="版本" width="65">
        <template #default="{ row }">{{ row.versionNo ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="85">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '已启用' : '未启用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="文件" width="80">
        <template #default="{ row }">
          <el-tag :type="row.hasFile ? 'success' : 'warning'" size="small">
            {{ row.hasFile ? '有文件' : '无文件' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="165">
        <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="290" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="primary" size="small" @click="openReplace(row)">替换内容</el-button>
          <el-button
            link
            :type="row.enabled ? 'warning' : 'success'"
            size="small"
            :loading="operating.has(row.id)"
            @click="onToggleEnabled(row)"
          >
            {{ row.enabled ? '停用' : '启用' }}
          </el-button>
          <el-button
            v-if="row.hasFile"
            link
            type="primary"
            size="small"
            :loading="downloading.has(row.id)"
            @click="onDownload(row)"
          >
            下载
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
      <template #empty>暂无模板</template>
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
    <el-dialog v-model="detailVisible" title="模板详情" width="700px">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="标识">{{ detail.code }}</el-descriptions-item>
            <el-descriptions-item label="名称">{{ detail.name }}</el-descriptions-item>
            <el-descriptions-item label="分类">{{ detail.category || '-' }}</el-descriptions-item>
            <el-descriptions-item label="描述" :span="2">{{ detail.description || '-' }}</el-descriptions-item>
            <el-descriptions-item label="原始文件名">{{ detail.originalName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="Content-Type">{{ detail.contentType || '-' }}</el-descriptions-item>
            <el-descriptions-item label="格式">{{ detail.extension || '-' }}</el-descriptions-item>
            <el-descriptions-item label="大小">{{ formatBytes(detail.sizeBytes) }}</el-descriptions-item>
            <el-descriptions-item label="版本号">{{ detail.versionNo ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="detail.enabled ? 'success' : 'info'" size="small">
                {{ detail.enabled ? '已启用' : '未启用' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDateTime(detail.createTime) }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ formatDateTime(detail.updateTime) }}</el-descriptions-item>
          </el-descriptions>
          <h4 style="margin: 16px 0 8px">模板变量</h4>
          <el-table :data="detailVariables" border size="small">
            <el-table-column prop="name" label="name" min-width="120" />
            <el-table-column prop="label" label="label" min-width="120" />
            <el-table-column label="required" width="90">
              <template #default="{ row }">
                <el-tag :type="row.required ? 'danger' : 'info'" size="small">
                  {{ row.required ? '必填' : '选填' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="description" min-width="150">
              <template #default="{ row }">{{ row.description || '-' }}</template>
            </el-table-column>
            <template #empty>未定义变量</template>
          </el-table>
        </template>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 新增（multipart，含文件） -->
    <el-dialog
      v-model="createVisible"
      title="新增模板"
      width="720px"
      :close-on-click-modal="false"
      @closed="resetCreate"
    >
      <el-form ref="createFormRef" :model="createForm" :rules="metaRules" label-width="100px">
        <el-form-item label="标识 code" prop="code">
          <el-input v-model="createForm.code" placeholder="唯一标识，如 weekly-report" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="模板名称" />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="createForm.category" placeholder="请选择分类" style="width: 100%">
            <el-option v-for="c in TEMPLATE_CATEGORIES" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="createForm.description" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
        <el-form-item label="模板文件">
          <el-upload
            ref="createUploadRef"
            :auto-upload="false"
            :limit="1"
            :on-change="(f) => (createFile = f.raw)"
            :on-remove="() => (createFile = null)"
            :on-exceed="(files) => onUploadExceed(createUploadRef, files, (raw) => (createFile = raw))"
          >
            <el-button>选择文件</el-button>
            <template #tip>
              <div class="el-upload__tip">支持所有格式；必须选择一个模板文件</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="变量定义">
          <variables-editor ref="createVarsRef" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑（JSON，不含文件） -->
    <el-dialog
      v-model="editVisible"
      title="编辑模板"
      width="720px"
      :close-on-click-modal="false"
      @closed="resetEdit"
    >
      <el-form ref="editFormRef" :model="editForm" :rules="metaRules" label-width="100px">
        <el-form-item label="标识 code" prop="code">
          <el-input v-model="editForm.code" disabled />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="editForm.name" placeholder="模板名称" />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="editForm.category" placeholder="请选择分类" style="width: 100%">
            <el-option v-for="c in TEMPLATE_CATEGORIES" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="editForm.description" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
        <el-form-item label="变量定义">
          <variables-editor ref="editVarsRef" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 替换内容（multipart，仅 file） -->
    <el-dialog
      v-model="replaceVisible"
      title="替换模板内容"
      width="480px"
      :close-on-click-modal="false"
      @closed="resetReplace"
    >
      <p style="margin: 0 0 12px; color: #606266">
        为模板「{{ replaceTarget?.name }}」上传新的内容文件，替换成功后版本号 +1。
      </p>
      <el-upload
        ref="replaceUploadRef"
        :auto-upload="false"
        :limit="1"
        :on-change="(f) => (replaceFile = f.raw)"
        :on-remove="() => (replaceFile = null)"
        :on-exceed="(files) => onUploadExceed(replaceUploadRef, files, (raw) => (replaceFile = raw))"
      >
        <el-button>选择文件</el-button>
        <template #tip>
          <div class="el-upload__tip">支持所有格式</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="replaceVisible = false">取消</el-button>
        <el-button type="primary" :loading="replacing" @click="submitReplace">替换</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, defineComponent, h } from 'vue'
import {
  ElMessage,
  ElMessageBox,
  ElTable,
  ElTableColumn,
  ElInput,
  ElSwitch,
  ElButton,
} from 'element-plus'
import {
  getTemplates,
  getTemplateDetail,
  createTemplate,
  updateTemplate,
  replaceTemplateContent,
  setTemplateEnabled,
  deleteTemplate,
  downloadTemplate,
  triggerBlobDownload,
} from '../api/admin'
import { formatDateTime, formatBytes, truncate } from '../utils/format'
import { TEMPLATE_CATEGORIES } from '../constants/enums'

// ---------- variables 编辑器（表格模式 + 源码模式双向同步） ----------
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

// 后端返回的 variables 是字符串形式的 JSON 数组，解析失败按空数组处理
function parseVariables(str) {
  if (!str) return []
  try {
    const v = JSON.parse(str)
    if (!Array.isArray(v)) return []
    return v.map((it) => ({
      name: it?.name ?? '',
      label: it?.label ?? '',
      required: !!it?.required,
      description: it?.description ?? '',
    }))
  } catch {
    return []
  }
}

// 内联子组件：变量编辑器，对外暴露 getValidated()（返回合法数组或 null）
const VariablesEditor = defineComponent({
  name: 'VariablesEditor',
  setup(_, { expose }) {
    const vars = ref([])
    const sourceMode = ref(false)
    const sourceText = ref('')

    function addRow() {
      vars.value.push({ name: '', label: '', required: false, description: '' })
    }
    function removeRow(i) {
      vars.value.splice(i, 1)
    }

    function syncFromSource() {
      if (!sourceText.value.trim()) {
        vars.value = []
        return true
      }
      let parsed
      try {
        parsed = JSON.parse(sourceText.value)
      } catch {
        ElMessage.error('JSON 格式不合法，请修正后再切换')
        return false
      }
      if (!Array.isArray(parsed)) {
        ElMessage.error('变量定义必须是 JSON 数组')
        return false
      }
      vars.value = parseVariables(sourceText.value)
      return true
    }

    function onModeChange(val) {
      if (val) {
        sourceText.value = JSON.stringify(vars.value, null, 2)
      } else if (!syncFromSource()) {
        // 解析失败停留在源码模式
        sourceMode.value = true
      }
    }

    // 提交前校验：name 必填且命名合法；不合法返回 null 并提示
    function getValidated() {
      if (sourceMode.value && !syncFromSource()) return null
      for (const v of vars.value) {
        if (!v.name || !v.name.trim()) {
          ElMessage.error('变量 name 不能为空')
          return null
        }
        if (!NAME_PATTERN.test(v.name)) {
          ElMessage.error(`变量名「${v.name}」不合法：仅允许字母、数字、下划线，且不能以数字开头`)
          return null
        }
      }
      return vars.value
    }

    function setVariables(list) {
      vars.value = list.map((it) => ({ ...it }))
      sourceText.value = ''
      sourceMode.value = false
    }

    expose({ getValidated, setVariables })

    return () =>
      h('div', { style: 'width: 100%' }, [
        h('div', { style: 'display: flex; justify-content: space-between; margin-bottom: 8px' }, [
          h(ElButton, { size: 'small', onClick: addRow }, () => '添加变量'),
          h('div', { style: 'display: flex; align-items: center; gap: 6px; font-size: 12px; color: #909399' }, [
            '源码模式',
            h(ElSwitch, {
              size: 'small',
              modelValue: sourceMode.value,
              'onUpdate:modelValue': (v) => {
                sourceMode.value = v
                onModeChange(v)
              },
            }),
          ]),
        ]),
        sourceMode.value
          ? h(ElInput, {
              type: 'textarea',
              rows: 8,
              modelValue: sourceText.value,
              'onUpdate:modelValue': (v) => (sourceText.value = v),
              placeholder: 'JSON 数组，如 [{"name":"title","label":"标题","required":true,"description":"文档标题"}]',
            })
          : h(
              ElTable,
              { data: vars.value, border: true, size: 'small' },
              {
                default: () => [
                  h(ElTableColumn, { label: 'name', minWidth: 130 }, {
                    default: ({ row }) =>
                      h(ElInput, {
                        size: 'small',
                        modelValue: row.name,
                        'onUpdate:modelValue': (v) => (row.name = v),
                        placeholder: '如 title',
                      }),
                  }),
                  h(ElTableColumn, { label: 'label', minWidth: 120 }, {
                    default: ({ row }) =>
                      h(ElInput, {
                        size: 'small',
                        modelValue: row.label,
                        'onUpdate:modelValue': (v) => (row.label = v),
                        placeholder: '界面显示名',
                      }),
                  }),
                  h(ElTableColumn, { label: 'required', width: 80, align: 'center' }, {
                    default: ({ row }) =>
                      h(ElSwitch, {
                        size: 'small',
                        modelValue: row.required,
                        'onUpdate:modelValue': (v) => (row.required = v),
                      }),
                  }),
                  h(ElTableColumn, { label: 'description', minWidth: 150 }, {
                    default: ({ row }) =>
                      h(ElInput, {
                        size: 'small',
                        modelValue: row.description,
                        'onUpdate:modelValue': (v) => (row.description = v),
                        placeholder: '选填',
                      }),
                  }),
                  h(ElTableColumn, { label: '操作', width: 70, align: 'center' }, {
                    default: ({ $index }) =>
                      h(
                        ElButton,
                        { link: true, type: 'danger', size: 'small', onClick: () => removeRow($index) },
                        () => '删除',
                      ),
                  }),
                ],
                empty: () => '未定义变量',
              },
            ),
      ])
  },
})

// ---------- 列表 ----------
const rows = ref([])
const loading = ref(false)
const page = ref(1)
const size = ref(20)
const total = ref(0)
const filters = reactive({ enabled: '', category: '', keyword: '' })

const operating = reactive(new Set())
const downloading = reactive(new Set())

function buildParams() {
  const params = { page: page.value, size: size.value }
  // enabled 为布尔值，空串表示全部不下发
  if (filters.enabled !== '') params.enabled = filters.enabled
  if (filters.category) params.category = filters.category
  if (filters.keyword?.trim()) params.keyword = filters.keyword.trim()
  return params
}

async function loadList() {
  loading.value = true
  try {
    const res = await getTemplates(buildParams())
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
  filters.enabled = ''
  filters.category = ''
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

// ---------- 详情 ----------
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const detailVariables = computed(() => parseVariables(detail.value?.variables))

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const res = await getTemplateDetail(row.id)
    detail.value = res.data
  } catch {
    // msg 已由 request 展示
  } finally {
    detailLoading.value = false
  }
}

// ---------- 表单通用 ----------
const metaRules = {
  code: [{ required: true, message: '请输入标识', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
}

// el-upload limit=1 时重新选择：清空旧文件后放入新文件
function onUploadExceed(uploadRef, files, setter) {
  const raw = files[0]
  uploadRef?.clearFiles()
  uploadRef?.handleStart(raw)
  setter(raw)
}

// ---------- 新增 ----------
const createVisible = ref(false)
const creating = ref(false)
const createFormRef = ref()
const createUploadRef = ref()
const createVarsRef = ref()
const createFile = ref(null)
const createForm = reactive({ code: '', name: '', category: '', description: '' })

function openCreate() {
  createVisible.value = true
}

function resetCreate() {
  Object.assign(createForm, { code: '', name: '', category: '', description: '' })
  createFile.value = null
  createUploadRef.value?.clearFiles()
  createVarsRef.value?.setVariables([])
  createFormRef.value?.clearValidate()
}

async function submitCreate() {
  try {
    await createFormRef.value.validate()
  } catch {
    return
  }
  if (!createFile.value) {
    ElMessage.error('请选择模板文件')
    return
  }
  const variables = createVarsRef.value.getValidated()
  if (variables === null) return
  creating.value = true
  try {
    // multipart：表单字段以接口文档为准
    const fd = new FormData()
    fd.append('code', createForm.code)
    fd.append('name', createForm.name)
    fd.append('category', createForm.category)
    if (createForm.description) fd.append('description', createForm.description)
    if (variables.length) fd.append('variables', JSON.stringify(variables))
    fd.append('file', createFile.value)
    await createTemplate(fd)
    ElMessage.success('模板已创建但未启用，普通用户当前不可见。')
    createVisible.value = false
    loadList()
  } catch {
    // msg 已由 request 展示
  } finally {
    creating.value = false
  }
}

// ---------- 编辑 ----------
const editVisible = ref(false)
const saving = ref(false)
const editFormRef = ref()
const editVarsRef = ref()
const editingId = ref(null)
const editForm = reactive({ code: '', name: '', category: '', description: '' })

async function openEdit(row) {
  editingId.value = row.id
  Object.assign(editForm, {
    code: row.code,
    name: row.name,
    category: row.category,
    description: row.description || '',
  })
  editVisible.value = true
  // 等弹窗内容渲染完成后再回显；variables 回显前必须二次 JSON.parse
  await nextTick()
  editVarsRef.value?.setVariables(parseVariables(row.variables))
}

function resetEdit() {
  editVarsRef.value?.setVariables([])
  editFormRef.value?.clearValidate()
}

async function submitEdit() {
  try {
    await editFormRef.value.validate()
  } catch {
    return
  }
  const variables = editVarsRef.value.getValidated()
  if (variables === null) return
  saving.value = true
  try {
    // JSON body：元数据，不含文件
    await updateTemplate(editingId.value, {
      code: editForm.code,
      name: editForm.name,
      category: editForm.category,
      description: editForm.description,
      variables: JSON.stringify(variables),
    })
    ElMessage.success('模板已更新')
    editVisible.value = false
    loadList()
  } catch {
    // msg 已由 request 展示
  } finally {
    saving.value = false
  }
}

// ---------- 替换内容 ----------
const replaceVisible = ref(false)
const replacing = ref(false)
const replaceUploadRef = ref()
const replaceTarget = ref(null)
const replaceFile = ref(null)

function openReplace(row) {
  replaceTarget.value = row
  replaceVisible.value = true
}

function resetReplace() {
  replaceFile.value = null
  replaceTarget.value = null
  replaceUploadRef.value?.clearFiles()
}

async function submitReplace() {
  if (!replaceFile.value) {
    ElMessage.error('请选择文件')
    return
  }
  replacing.value = true
  try {
    const fd = new FormData()
    fd.append('file', replaceFile.value)
    await replaceTemplateContent(replaceTarget.value.id, fd)
    ElMessage.success('内容已替换，版本号 +1；旧文件仍保留可回退，清理由后台任务负责')
    replaceVisible.value = false
    loadList()
  } catch {
    // msg 已由 request 展示
  } finally {
    replacing.value = false
  }
}

// ---------- 启用 / 停用 / 下载 / 删除 ----------
async function onToggleEnabled(row) {
  const target = !row.enabled
  try {
    await ElMessageBox.confirm(
      target
        ? `确认启用模板「${row.name}」？启用后普通用户可见。`
        : `确认停用模板「${row.name}」？停用后普通用户不可见。`,
      `${target ? '启用' : '停用'}确认`,
      { type: 'warning', confirmButtonText: `确认${target ? '启用' : '停用'}`, cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  operating.add(row.id)
  try {
    await setTemplateEnabled(row.id, target)
    ElMessage.success(target ? '已启用' : '已停用')
    loadList()
  } catch {
    // msg 已由 request 展示
  } finally {
    operating.delete(row.id)
  }
}

async function onDownload(row) {
  downloading.add(row.id)
  try {
    const res = await downloadTemplate(row.id)
    triggerBlobDownload(res, row.originalName || `template-${row.id}`)
  } catch {
    // msg 已由 request 展示
  } finally {
    downloading.delete(row.id)
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除模板「${row.name}」（${row.code}）？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  operating.add(row.id)
  try {
    await deleteTemplate(row.id)
    ElMessage.success('模板已删除')
    loadList()
  } catch {
    // 409 等 msg 已由 request 默认展示
  } finally {
    operating.delete(row.id)
  }
}

onMounted(loadList)
</script>
