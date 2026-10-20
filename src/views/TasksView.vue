<template>
  <div class="page-card">
    <div class="filter-bar">
      <el-select v-model="filters.status" placeholder="任务状态" clearable style="width: 140px">
        <el-option v-for="(v, k) in TASK_STATUS" :key="k" :label="v.label" :value="k" />
      </el-select>
      <el-select v-model="filters.taskType" placeholder="任务类型" clearable style="width: 150px">
        <el-option v-for="(label, k) in TASK_TYPE" :key="k" :label="label" :value="k" />
      </el-select>
      <el-input-number
        v-model="filters.fileId"
        :min="1"
        :controls="false"
        placeholder="文件ID"
        style="width: 130px"
      />
      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="onReset">重置</el-button>
      <el-button type="danger" plain @click="showFailedOnly">仅看失败任务</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border stripe>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="userId" label="用户ID" width="90">
        <template #default="{ row }">{{ row.userId ?? '-' }}</template>
      </el-table-column>
      <el-table-column prop="fileId" label="文件ID" width="90">
        <template #default="{ row }">{{ row.fileId ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="任务类型" width="110">
        <template #default="{ row }">{{ enumLabel(TASK_TYPE, row.taskType) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="enumTag(TASK_STATUS, row.status)" size="small">
            {{ enumLabel(TASK_STATUS, row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="进度" width="150">
        <template #default="{ row }">
          <el-progress
            :percentage="row.progress ?? 0"
            :status="progressStatus(row.status)"
            :stroke-width="10"
          />
        </template>
      </el-table-column>
      <el-table-column label="当前步骤" min-width="110">
        <template #default="{ row }">{{ row.currentStep || '-' }}</template>
      </el-table-column>
      <el-table-column label="错误码" width="110">
        <template #default="{ row }">{{ row.errorCode || '-' }}</template>
      </el-table-column>
      <el-table-column label="错误信息" min-width="160">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.errorMessage"
            :content="row.errorMessage"
            placement="top"
            effect="dark"
            :show-after="200"
          >
            <span style="cursor: default">{{ truncate(row.errorMessage, 30) }}</span>
          </el-tooltip>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="重试" width="70">
        <template #default="{ row }">{{ row.retryCount ?? '-' }}/{{ row.maxRetry ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="165">
        <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
      </el-table-column>
      <el-table-column label="耗时" width="90">
        <template #default="{ row }">{{ formatDuration(row.elapsedMs) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
          <el-button
            v-if="row.status === 'PENDING' || row.status === 'RUNNING'"
            link
            type="warning"
            size="small"
            :loading="operating.has(row.id)"
            @click="onCancel(row)"
          >
            取消
          </el-button>
          <el-button
            v-if="row.status === 'FAILED' || row.status === 'CANCELLED'"
            link
            type="success"
            size="small"
            :loading="operating.has(row.id)"
            @click="onRetry(row)"
          >
            重试
          </el-button>
        </template>
      </el-table-column>
      <template #empty>暂无任务</template>
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

    <el-drawer v-model="detailVisible" title="任务详情" size="660px" @closed="stopDetailPolling">
      <div v-loading="detailLoading">
        <template v-if="detail.task">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="任务ID">{{ detail.task.id }}</el-descriptions-item>
            <el-descriptions-item label="用户ID">{{ detail.task.userId ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="文件ID">{{ detail.task.fileId ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="任务类型">
              {{ enumLabel(TASK_TYPE, detail.task.taskType) }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="enumTag(TASK_STATUS, detail.task.status)" size="small">
                {{ enumLabel(TASK_STATUS, detail.task.status) }}
              </el-tag>
              <el-tag v-if="detail.task.cancelRequested" type="warning" size="small" style="margin-left: 6px">
                取消请求中
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="进度">{{ detail.task.progress ?? 0 }}%</el-descriptions-item>
            <el-descriptions-item label="当前步骤">{{ detail.task.currentStep || '-' }}</el-descriptions-item>
            <el-descriptions-item label="重试次数">
              {{ detail.task.retryCount ?? '-' }}/{{ detail.task.maxRetry ?? '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="错误码">{{ detail.task.errorCode || '-' }}</el-descriptions-item>
            <el-descriptions-item label="输入版本">{{ detail.task.inputVersion ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="输出版本">{{ detail.task.outputVersion ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDateTime(detail.task.createTime) }}</el-descriptions-item>
            <el-descriptions-item label="开始时间">{{ formatDateTime(detail.task.startTime) }}</el-descriptions-item>
            <el-descriptions-item label="结束时间">{{ formatDateTime(detail.task.finishTime) }}</el-descriptions-item>
            <el-descriptions-item label="耗时">{{ formatDuration(detail.task.elapsedMs) }}</el-descriptions-item>
            <el-descriptions-item label="用户指令" :span="2">{{ detail.task.instruction || '-' }}</el-descriptions-item>
            <el-descriptions-item label="错误信息" :span="2">
              <span style="white-space: pre-wrap; word-break: break-all">{{ detail.task.errorMessage || '-' }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <h4 style="margin: 16px 0 8px">执行步骤</h4>
          <el-table :data="detail.steps" border size="small">
            <el-table-column prop="stepNo" label="#" width="50" />
            <el-table-column prop="stepName" label="步骤名称" min-width="110" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="enumTag(STEP_STATUS, row.status)" size="small">
                  {{ enumLabel(STEP_STATUS, row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="详情" min-width="130">
              <template #default="{ row }">
                <el-tooltip v-if="row.detail" :content="row.detail" placement="top" effect="dark">
                  <span style="cursor: default">{{ truncate(row.detail, 20) }}</span>
                </el-tooltip>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="错误信息" min-width="130">
              <template #default="{ row }">
                <el-tooltip v-if="row.errorMessage" :content="row.errorMessage" placement="top" effect="dark">
                  <span style="cursor: default">{{ truncate(row.errorMessage, 20) }}</span>
                </el-tooltip>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="开始时间" width="150">
              <template #default="{ row }">{{ formatDateTime(row.startTime) }}</template>
            </el-table-column>
            <el-table-column label="结束时间" width="150">
              <template #default="{ row }">{{ formatDateTime(row.finishTime) }}</template>
            </el-table-column>
            <el-table-column label="耗时" width="80">
              <template #default="{ row }">{{ formatDuration(row.durationMs) }}</template>
            </el-table-column>
            <template #empty>暂无步骤</template>
          </el-table>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-descriptions-item.css'
import 'element-plus/theme-chalk/el-descriptions.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-input-number.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/el-option-group.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-pagination.css'
import 'element-plus/theme-chalk/el-progress.css'
import 'element-plus/theme-chalk/el-tooltip.css'
import 'element-plus/theme-chalk/el-checkbox.css'
import 'element-plus/theme-chalk/el-table.css'
import 'element-plus/theme-chalk/el-table-column.css'

import { ElButton, ElDescriptions, ElDescriptionsItem, ElDrawer, ElInputNumber, ElOption, ElPagination, ElProgress, ElSelect, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'

import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getTasks, getTaskDetail, cancelTask, retryTask } from '../api/admin'
import { formatDateTime, formatDuration, truncate } from '../utils/format'
import { TASK_STATUS, TASK_TYPE, STEP_STATUS, enumLabel, enumTag } from '../constants/enums'

const route = useRoute()

const rows = ref([])
const loading = ref(false)
const page = ref(1)
const size = ref(20)
const total = ref(0)
const filters = reactive({ status: '', taskType: '', fileId: null })

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = reactive({ task: null, steps: [] })

// 行操作（取消/重试）防重复
const operating = reactive(new Set())

let listTimer = null
let listFailCount = 0
let detailTimer = null
let detailFailCount = 0

function buildParams() {
  const params = { page: page.value, size: size.value }
  if (filters.status) params.status = filters.status
  if (filters.taskType) params.taskType = filters.taskType
  if (filters.fileId) params.fileId = filters.fileId
  return params
}

async function loadList(silent = false) {
  if (!silent) loading.value = true
  try {
    // 静默轮询走 silent 请求，避免轮询失败弹错误
    const res = silent
      ? await getTasks(buildParams(), { silent: true })
      : await getTasks(buildParams())
    rows.value = res.data.records || []
    total.value = res.data.total || 0
    listFailCount = 0
    syncListPolling()
  } catch {
    if (silent) {
      listFailCount++
      if (listFailCount >= 3) stopListPolling()
    }
  } finally {
    if (!silent) loading.value = false
  }
}

function hasActiveTask() {
  return rows.value.some((t) => t.status === 'PENDING' || t.status === 'RUNNING')
}

// 列表存在非终态任务时每 5 秒静默轮询，全部终态即停
function syncListPolling() {
  if (hasActiveTask()) {
    if (!listTimer) listTimer = setInterval(() => loadList(true), 5000)
  } else {
    stopListPolling()
  }
}

function stopListPolling() {
  if (listTimer) {
    clearInterval(listTimer)
    listTimer = null
  }
  listFailCount = 0
}

function progressStatus(status) {
  if (status === 'SUCCEEDED') return 'success'
  if (status === 'FAILED') return 'exception'
  if (status === 'CANCELLED') return 'warning'
  return ''
}

function onSearch() {
  page.value = 1
  loadList()
}

function onReset() {
  filters.status = ''
  filters.taskType = ''
  filters.fileId = null
  page.value = 1
  loadList()
}

function showFailedOnly() {
  filters.status = 'FAILED'
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
  detail.task = null
  detail.steps = []
  try {
    const res = await getTaskDetail(row.id)
    detail.task = res.data.task
    detail.steps = res.data.steps || []
    syncDetailPolling()
  } catch {
    // 错误提示已由 request 统一处理
  } finally {
    detailLoading.value = false
  }
}

// 详情抽屉打开且任务非终态时每 2 秒轮询，进终态即停
async function pollDetail() {
  if (!detail.task) return
  try {
    const res = await getTaskDetail(detail.task.id, { silent: true })
    detail.task = res.data.task
    detail.steps = res.data.steps || []
    detailFailCount = 0
    syncDetailPolling()
  } catch {
    detailFailCount++
    if (detailFailCount >= 3) stopDetailPolling()
  }
}

function syncDetailPolling() {
  const s = detail.task?.status
  if (detailVisible.value && (s === 'PENDING' || s === 'RUNNING')) {
    if (!detailTimer) detailTimer = setInterval(pollDetail, 2000)
  } else {
    stopDetailPolling()
  }
}

function stopDetailPolling() {
  if (detailTimer) {
    clearInterval(detailTimer)
    detailTimer = null
  }
  detailFailCount = 0
}

async function onCancel(row) {
  const isRunning = row.status === 'RUNNING'
  try {
    await ElMessageBox.confirm(
      isRunning
        ? '任务正在执行中，取消后需等待当前步骤执行完毕才会终止，确认取消？'
        : '任务尚在排队中，确认取消该任务？',
      '取消确认',
      { type: 'warning', confirmButtonText: '确认取消', cancelButtonText: '再想想' },
    )
  } catch {
    return
  }
  operating.add(row.id)
  try {
    await cancelTask(row.id)
    ElMessage.success(isRunning ? '已请求取消，等待当前步骤执行完毕后终止' : '任务已取消')
    loadList()
    // 若详情抽屉正展示该任务，立即刷新一次详情
    if (detailVisible.value && detail.task?.id === row.id) pollDetail()
  } catch {
    // msg 已由 request 展示
  } finally {
    operating.delete(row.id)
  }
}

async function onRetry(row) {
  try {
    await ElMessageBox.confirm(
      '将基于原任务创建一个新的重试任务（原任务保留），确认重试？',
      '重试确认',
      { type: 'warning', confirmButtonText: '确认重试', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  operating.add(row.id)
  try {
    await retryTask(row.id)
    ElMessage.success('已创建新的重试任务')
    loadList()
  } catch {
    // msg 已由 request 展示（含 409/429）
  } finally {
    operating.delete(row.id)
  }
}

onMounted(() => {
  // 概览页失败任务卡跳转会带 ?status=FAILED
  const qStatus = route.query.status
  if (typeof qStatus === 'string' && TASK_STATUS[qStatus]) {
    filters.status = qStatus
  }
  loadList()
})

onBeforeUnmount(() => {
  stopListPolling()
  stopDetailPolling()
})
</script>
