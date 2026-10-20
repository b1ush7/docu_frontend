<template>
  <div class="page-card">
    <!-- 筛选区 -->
    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="按手机号搜索"
        clearable
        style="width: 220px"
        @keyup.enter="onSearch"
        @clear="onSearch"
      />
      <el-select v-model="filters.status" placeholder="账号状态" clearable style="width: 140px">
        <el-option v-for="(v, k) in ACCOUNT_STATUS" :key="k" :label="v.label" :value="k" />
      </el-select>
      <el-select v-model="filters.role" placeholder="角色" clearable style="width: 140px">
        <el-option v-for="(v, k) in USER_ROLE" :key="k" :label="v.label" :value="k" />
      </el-select>
      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>

    <!-- 操作区 -->
    <div class="filter-bar">
      <el-button type="success" :disabled="!selection.length" :loading="batchLoading" @click="runBatch('ENABLED')">
        批量启用
      </el-button>
      <el-button type="danger" :disabled="!selection.length" :loading="batchLoading" @click="runBatch('DISABLED')">
        批量禁用
      </el-button>
      <el-button :icon="Refresh" :loading="loading" @click="loadUsers">刷新</el-button>
      <span v-if="selection.length" class="text-secondary">已勾选 {{ selection.length }} 项</span>
    </div>

    <!-- 用户列表 -->
    <el-table ref="tableRef" :data="list" v-loading="loading" border @selection-change="onSelectionChange">
      <el-table-column type="selection" width="48" />
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="username" label="用户名" min-width="110" show-overflow-tooltip />
      <el-table-column prop="phone" label="手机号" width="130">
        <template #default="{ row }">{{ row.phone || '-' }}</template>
      </el-table-column>
      <el-table-column prop="role" label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="enumTag(USER_ROLE, row.role)">{{ enumLabel(USER_ROLE, row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="enumTag(ACCOUNT_STATUS, row.status)">{{ enumLabel(ACCOUNT_STATUS, row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="balance" label="余额" width="120" align="right">
        <template #default="{ row }">{{ formatBalance(row.balance) }}</template>
      </el-table-column>
      <el-table-column prop="createTime" label="创建时间" width="165">
        <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
      </el-table-column>
      <el-table-column prop="updateTime" label="更新时间" width="165">
        <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
      </el-table-column>
      <el-table-column prop="lastLoginTime" label="最后登录" width="165">
        <template #default="{ row }">{{ formatDateTime(row.lastLoginTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="225" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
          <el-button link type="primary" size="small" @click="openUsage(row)">用量</el-button>
          <!-- 自我拦截：不能禁用自己的账号（disabled 按钮不触发 tooltip，需外层 span） -->
          <el-tooltip :disabled="!isSelf(row)" content="不能禁用自己的账号" placement="top">
            <span>
              <el-button
                link
                :type="row.status === 'ENABLED' ? 'danger' : 'success'"
                size="small"
                :disabled="isSelf(row)"
                @click="onToggleStatus(row)"
              >
                {{ row.status === 'ENABLED' ? '禁用' : '启用' }}
              </el-button>
            </span>
          </el-tooltip>
          <el-tooltip :disabled="!isSelf(row)" content="不能降低自己的角色" placement="top">
            <span>
              <el-button link type="warning" size="small" :disabled="isSelf(row)" @click="openRoleDialog(row)">
                改角色
              </el-button>
            </span>
          </el-tooltip>
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
        @current-change="loadUsers"
      />
    </div>

    <!-- 用户详情（只读） -->
    <el-dialog v-model="detailVisible" title="用户详情" width="640px">
      <div v-loading="detailLoading" style="min-height: 200px">
        <el-descriptions v-if="detail" :column="2" border>
          <el-descriptions-item label="用户 ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="用户名">{{ detail.username }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ detail.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="角色">
            <el-tag :type="enumTag(USER_ROLE, detail.role)">{{ enumLabel(USER_ROLE, detail.role) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="enumTag(ACCOUNT_STATUS, detail.status)">{{ enumLabel(ACCOUNT_STATUS, detail.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="余额">{{ formatBalance(detail.balance) }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(detail.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDateTime(detail.updateTime) }}</el-descriptions-item>
          <el-descriptions-item label="最后登录时间">{{ formatDateTime(detail.lastLoginTime) }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <!-- 用户用量（只读） -->
    <el-dialog v-model="usageVisible" :title="usageUser ? `用户用量 - ${usageUser.username}` : '用户用量'" width="640px">
      <div v-loading="usageLoading" style="min-height: 200px">
        <el-descriptions v-if="usage" :column="2" border>
          <el-descriptions-item label="在用文件数">{{ usage.activeFiles ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="存储占用">{{ formatBytes(usage.storageBytes) }}</el-descriptions-item>
          <el-descriptions-item label="总任务数">{{ usage.totalTasks ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="排队中">{{ usage.pendingTasks ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="执行中">{{ usage.runningTasks ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="已成功">{{ usage.succeededTasks ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="已失败">{{ usage.failedTasks ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="已取消">{{ usage.cancelledTasks ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="任务失败率">{{ formatPercent(usage.taskFailureRate) }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <!-- 修改角色 -->
    <el-dialog v-model="roleDialogVisible" title="修改角色" width="440px" :close-on-click-modal="false">
      <div v-if="roleTarget" style="margin-bottom: 16px">
        当前用户：{{ roleTarget.username }}（ID: {{ roleTarget.id }}），当前角色：
        <el-tag :type="enumTag(USER_ROLE, roleTarget.role)" size="small">
          {{ enumLabel(USER_ROLE, roleTarget.role) }}
        </el-tag>
      </div>
      <el-form label-width="90px">
        <el-form-item label="目标角色" required>
          <el-select v-model="roleForm.role" style="width: 100%">
            <el-option v-for="(v, k) in USER_ROLE" :key="k" :label="v.label" :value="k" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-alert
        v-if="roleTarget"
        type="warning"
        :closable="false"
        :title="roleForm.role === 'ADMIN' ? `将把「${roleTarget.username}」提升为管理员` : `将把「${roleTarget.username}」降为普通用户`"
      />
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="roleSubmitting" @click="submitRole">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-alert.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-descriptions-item.css'
import 'element-plus/theme-chalk/el-descriptions.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-form.css'
import 'element-plus/theme-chalk/el-form-item.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/el-option-group.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-pagination.css'
import 'element-plus/theme-chalk/el-tooltip.css'
import 'element-plus/theme-chalk/el-checkbox.css'
import 'element-plus/theme-chalk/el-table.css'
import 'element-plus/theme-chalk/el-table-column.css'

import { ElAlert, ElButton, ElDescriptions, ElDescriptionsItem, ElDialog, ElForm, ElFormItem, ElInput, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'

import { ref, reactive, h, onMounted } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getUsers, getUserDetail, getUserUsage, updateUserStatus, updateUserRole } from '../api/admin'
import { useAuthStore } from '../stores/auth'
import { USER_ROLE, ACCOUNT_STATUS, enumLabel, enumTag } from '../constants/enums'
import { formatDateTime, formatBytes, formatPercent, formatBalance } from '../utils/format'

const auth = useAuthStore()

// ============ 列表与筛选 ============
const tableRef = ref()
const list = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const loading = ref(false)
const filters = reactive({ keyword: '', status: '', role: '' })

async function loadUsers() {
  loading.value = true
  try {
    const params = { page: page.value, size: size.value }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.status) params.status = filters.status
    if (filters.role) params.role = filters.role
    const res = await getUsers(params)
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
  loadUsers()
}

function onReset() {
  filters.keyword = ''
  filters.status = ''
  filters.role = ''
  page.value = 1
  loadUsers()
}

function onSizeChange() {
  page.value = 1
  loadUsers()
}

function isSelf(row) {
  return row.id === auth.user?.id
}

// ============ 详情 / 用量 ============
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const res = await getUserDetail(row.id)
    detail.value = res.data
  } catch {
    // 错误提示由 request.js 统一处理
  } finally {
    detailLoading.value = false
  }
}

const usageVisible = ref(false)
const usageLoading = ref(false)
const usage = ref(null)
const usageUser = ref(null)

async function openUsage(row) {
  usageUser.value = row
  usageVisible.value = true
  usageLoading.value = true
  usage.value = null
  try {
    const res = await getUserUsage(row.id)
    usage.value = res.data
  } catch {
    // 错误提示由 request.js 统一处理
  } finally {
    usageLoading.value = false
  }
}

// ============ 启用 / 禁用（单行） ============
function onToggleStatus(row) {
  const target = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  const actionText = target === 'ENABLED' ? '启用' : '禁用'
  ElMessageBox.confirm(`确认${actionText}用户「${row.username}」（ID: ${row.id}）？`, `${actionText}确认`, {
    type: 'warning',
    confirmButtonText: `确认${actionText}`,
    cancelButtonText: '取消',
    // beforeClose 中挂 loading 防重复提交
    beforeClose: async (action, instance, done) => {
      if (action !== 'confirm') return done()
      instance.confirmButtonLoading = true
      try {
        await updateUserStatus(row.id, target)
        done()
        ElMessage.success(`已${actionText}`)
        loadUsers()
      } catch (err) {
        done()
        // 409（自我拦截/并发修改）msg 已由 request.js 默认弹出，这里刷新列表对齐最新状态
        if (err?.code === 409) loadUsers()
      } finally {
        instance.confirmButtonLoading = false
      }
    },
  }).catch(() => {})
}

// ============ 修改角色 ============
const roleDialogVisible = ref(false)
const roleSubmitting = ref(false)
const roleTarget = ref(null)
const roleForm = reactive({ role: 'USER' })

function openRoleDialog(row) {
  roleTarget.value = row
  // 默认选中与当前相反的角色，减少误操作
  roleForm.role = row.role === 'ADMIN' ? 'USER' : 'ADMIN'
  roleDialogVisible.value = true
}

async function submitRole() {
  if (!roleTarget.value) return
  if (roleForm.role === roleTarget.value.role) {
    ElMessage.warning('目标角色与当前角色相同，无需修改')
    return
  }
  roleSubmitting.value = true
  try {
    await updateUserRole(roleTarget.value.id, roleForm.role)
    ElMessage.success('角色已修改')
    roleDialogVisible.value = false
    loadUsers()
  } catch (err) {
    if (err?.code === 409) loadUsers()
  } finally {
    roleSubmitting.value = false
  }
}

// ============ 批量启用 / 禁用 ============
const selection = ref([])
const batchLoading = ref(false)

function onSelectionChange(rows) {
  // 批量操作自动剔除当前登录管理员自己
  const self = rows.find((r) => isSelf(r))
  if (self) {
    tableRef.value?.toggleRowSelection(self, false)
    ElMessage.warning('不能对自己的账号执行批量操作，已自动剔除')
    return
  }
  selection.value = rows
}

async function runBatch(targetStatus) {
  const rows = selection.value
  if (!rows.length) return
  const actionText = targetStatus === 'ENABLED' ? '启用' : '禁用'
  const names = rows.slice(0, 10).map((r) => `${r.username}（ID: ${r.id}）`).join('、')
  try {
    // 用户名来自用户输入，用 VNode 渲染避免 XSS
    await ElMessageBox({
      title: `批量${actionText}确认`,
      type: 'warning',
      showCancelButton: true,
      confirmButtonText: `确认${actionText}`,
      cancelButtonText: '取消',
      message: h('div', null, [
        h('p', null, `将${actionText} ${rows.length} 个账号：`),
        h('p', null, rows.length > 10 ? `${names} 等 ${rows.length} 个账号` : names),
      ]),
    })
  } catch {
    return // 用户取消
  }
  batchLoading.value = true
  let successCount = 0
  const failures = []
  // 逐个调用启停接口，单个失败不影响其余
  for (const row of rows) {
    try {
      await updateUserStatus(row.id, targetStatus)
      successCount++
    } catch (err) {
      failures.push(`${row.username}（ID: ${row.id}）：${err?.message || '操作失败'}`)
    }
  }
  batchLoading.value = false
  const summary = `批量${actionText}完成：成功 ${successCount} 个，失败 ${failures.length} 个`
  if (failures.length) {
    ElMessage.warning(summary)
    ElNotification({
      title: `批量${actionText}失败明细`,
      type: 'error',
      duration: 0,
      message: h('div', failures.map((f) => h('div', { style: 'margin-bottom: 4px' }, f))),
    })
  } else {
    ElMessage.success(summary)
  }
  tableRef.value?.clearSelection()
  loadUsers()
}

onMounted(loadUsers)
</script>
