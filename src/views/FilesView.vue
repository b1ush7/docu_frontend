<template>
  <div class="page-card">
    <!-- 筛选区：status 默认 READY，"全部"对应不传 status -->
    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="按文件名搜索"
        clearable
        style="width: 220px"
        @keyup.enter="onSearch"
        @clear="onSearch"
      />
      <el-select v-model="filters.status" placeholder="文件状态" style="width: 140px">
        <el-option v-for="(v, k) in FILE_STATUS" :key="k" :label="v.label" :value="k" />
      </el-select>
      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="onReset">重置</el-button>
      <el-button :icon="Refresh" :loading="loading" @click="loadFiles">刷新</el-button>
    </div>

    <!-- 文件列表 -->
    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="displayName" label="展示名" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.displayName || '-' }}</template>
      </el-table-column>
      <el-table-column prop="originalName" label="原始文件名" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.originalName || '-' }}</template>
      </el-table-column>
      <el-table-column prop="extension" label="扩展名" width="80">
        <template #default="{ row }">{{ row.extension || '-' }}</template>
      </el-table-column>
      <el-table-column prop="sizeBytes" label="大小" width="100" align="right">
        <template #default="{ row }">{{ formatBytes(row.sizeBytes) }}</template>
      </el-table-column>
      <el-table-column prop="source" label="来源" width="100">
        <template #default="{ row }">
          <el-tag :type="enumTag(FILE_SOURCE, row.source)">{{ enumLabel(FILE_SOURCE, row.source) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="enumTag(FILE_STATUS, row.status)">{{ enumLabel(FILE_STATUS, row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="latestVersion" label="版本" width="70" align="center">
        <template #default="{ row }">{{ row.latestVersion ?? '-' }}</template>
      </el-table-column>
      <el-table-column prop="userId" label="归属用户" width="120">
        <template #default="{ row }">用户 ID: {{ row.userId }}</template>
      </el-table-column>
      <el-table-column prop="createTime" label="创建时间" width="165">
        <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
      </el-table-column>
      <el-table-column prop="updateTime" label="更新时间" width="165">
        <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="205" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
          <el-button link type="primary" size="small" :loading="downloadingId === row.id" @click="onDownload(row)">
            下载
          </el-button>
          <!-- 已删除文件不可重命名 -->
          <el-button link type="warning" size="small" :disabled="row.status === 'DELETED'" @click="openRename(row)">
            重命名
          </el-button>
          <el-button link type="danger" size="small" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="table-footer">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="size"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="onSizeChange"
        @current-change="loadFiles"
      />
    </div>

    <!-- 文件详情（只读，顶部审计提示） -->
    <el-dialog v-model="detailVisible" title="文件详情" width="720px">
      <el-alert type="warning" :closable="false" title="本次查看已被记录到审计日志" style="margin-bottom: 12px" />
      <div v-loading="detailLoading" style="min-height: 240px">
        <el-descriptions v-if="detail" :column="2" border>
          <el-descriptions-item label="文件 ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="归属用户">用户 ID: {{ detail.userId }}</el-descriptions-item>
          <el-descriptions-item label="展示名" :span="2">{{ detail.displayName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="原始文件名" :span="2">{{ detail.originalName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="扩展名">{{ detail.extension || '-' }}</el-descriptions-item>
          <el-descriptions-item label="内容类型">{{ detail.contentType || '-' }}</el-descriptions-item>
          <el-descriptions-item label="大小">{{ formatBytes(detail.sizeBytes) }}</el-descriptions-item>
          <el-descriptions-item label="最新版本">{{ detail.latestVersion ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="来源">
            <el-tag :type="enumTag(FILE_SOURCE, detail.source)">{{ enumLabel(FILE_SOURCE, detail.source) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="enumTag(FILE_STATUS, detail.status)">{{ enumLabel(FILE_STATUS, detail.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="SHA-256" :span="2">
            <span style="word-break: break-all">{{ detail.sha256 || '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(detail.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDateTime(detail.updateTime) }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <!-- 重命名 -->
    <el-dialog v-model="renameVisible" title="重命名文件" width="440px" :close-on-click-modal="false">
      <el-form ref="renameFormRef" :model="renameForm" :rules="renameRules" label-width="90px">
        <el-form-item label="文件名称" prop="displayName">
          <el-input
            v-model="renameForm.displayName"
            maxlength="200"
            show-word-limit
            placeholder="请输入新的文件名称"
            @keyup.enter="submitRename"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameVisible = false">取消</el-button>
        <el-button type="primary" :loading="renameSubmitting" @click="submitRename">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getFiles, getFileDetail, renameFile, deleteFile, downloadFile, triggerBlobDownload } from '../api/admin'
import { FILE_STATUS, FILE_SOURCE, enumLabel, enumTag } from '../constants/enums'
import { formatDateTime, formatBytes } from '../utils/format'

// ============ 列表与筛选 ============
const list = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const loading = ref(false)
// 文件状态默认查 READY；"全部"对应空串，请求时不传 status
const filters = reactive({ keyword: '', status: 'READY' })

async function loadFiles() {
  loading.value = true
  try {
    const params = { page: page.value, size: size.value }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.status) params.status = filters.status
    const res = await getFiles(params)
    list.value = res.data.records || []
    total.value = res.data.total || 0
  } catch {
    // 错误提示由 request.js 统一处理，列表保留旧数据
  } finally {
    loading.value = false
  }
}

// 切换筛选条件重置回第 1 页
function onSearch() {
  page.value = 1
  loadFiles()
}

function onReset() {
  filters.keyword = ''
  filters.status = 'READY'
  page.value = 1
  loadFiles()
}

function onSizeChange() {
  page.value = 1
  loadFiles()
}

// ============ 详情 ============
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const res = await getFileDetail(row.id)
    detail.value = res.data
  } catch {
    // 错误提示由 request.js 统一处理
  } finally {
    detailLoading.value = false
  }
}

// ============ 下载 ============
const downloadingId = ref(null)

async function onDownload(row) {
  ElMessage.info('本次下载已被记录到审计日志')
  downloadingId.value = row.id
  try {
    const res = await downloadFile(row.id)
    // blob 响应不经过统一 JSON 解析：业务失败时 blob 实为 JSON 错误体，先甄别再触发下载
    if (res.data?.type?.includes('application/json')) {
      let msg = '下载失败'
      try {
        msg = JSON.parse(await res.data.text()).msg || msg
      } catch {
        // 解析失败则保留默认提示
      }
      ElMessage.error(msg)
      return
    }
    triggerBlobDownload(res, row.displayName)
  } catch {
    // HTTP 层错误由 request.js 统一提示
  } finally {
    downloadingId.value = null
  }
}

// ============ 重命名 ============
const renameVisible = ref(false)
const renameSubmitting = ref(false)
const renameTarget = ref(null)
const renameFormRef = ref()
const renameForm = reactive({ displayName: '' })
const renameRules = {
  displayName: [
    { required: true, message: '请输入文件名称', trigger: 'blur' },
    { max: 200, message: '名称最长 200 字符', trigger: 'blur' },
    {
      validator: (_r, v, cb) => (v && v.trim() ? cb() : cb(new Error('名称不能为空白'))),
      trigger: 'blur',
    },
  ],
}

function openRename(row) {
  renameTarget.value = row
  renameForm.displayName = row.displayName || ''
  renameVisible.value = true
}

async function submitRename() {
  await renameFormRef.value.validate()
  renameSubmitting.value = true
  try {
    await renameFile(renameTarget.value.id, renameForm.displayName.trim())
    ElMessage.success('重命名成功')
    renameVisible.value = false
    loadFiles()
  } catch {
    // 错误提示由 request.js 统一处理
  } finally {
    renameSubmitting.value = false
  }
}

// ============ 删除（软删除，幂等） ============
function onDelete(row) {
  ElMessageBox.confirm(
    `确认删除文件「${row.displayName}」（ID: ${row.id}）？删除为软删除，历史版本与磁盘内容保留。`,
    '删除确认',
    {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      // beforeClose 中挂 loading 防重复提交
      beforeClose: async (action, instance, done) => {
        if (action !== 'confirm') return done()
        instance.confirmButtonLoading = true
        try {
          await deleteFile(row.id)
          done()
          ElMessage.success('已删除')
          loadFiles()
        } catch {
          done()
          // 错误提示由 request.js 统一处理
        } finally {
          instance.confirmButtonLoading = false
        }
      },
    },
  ).catch(() => {})
}

onMounted(loadFiles)
</script>
