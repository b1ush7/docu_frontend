<script setup lang="ts">
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-checkbox.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import 'element-plus/theme-chalk/el-date-picker-panel.css'
import 'element-plus/theme-chalk/el-date-picker.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/el-option-group.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-pagination.css'
import 'element-plus/theme-chalk/el-tooltip.css'
import 'element-plus/theme-chalk/el-table.css'
import 'element-plus/theme-chalk/el-table-column.css'

import { ElButton, ElCheckbox, ElDatePicker, ElInput, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'

/**
 * @component AuditLogsView
 * @description 审计日志查询与正式存储回收（API.md 7.15 / 7.14）。
 *
 * 语义要点：
 *   - 审计日志**固定按时间倒序**，后端不接受前端指定排序字段（避免 ORDER BY 注入），
 *     所以这里不提供排序控件。
 *   - `username` 是写入时的**快照**，用户改名或删除后仍可追溯。
 *   - 存储回收**默认 dryRun=true**（只统计不删除），真正执行必须显式取消勾选，
 *     并会写入审计日志；结果只包含本批次，`truncated=true` 表示需要再次运行。
 */
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminAuditApi, adminStorageApi } from '@/api/admin-content'
import { useRequestGuard } from '@/composables/useRequestGuard'
import { ApiError } from '@/api/http'
import { formatDateTime } from '@/utils/format'
import type { AuditLog, AuditQueryParams, StorageRecycleReport } from '@/api/types'

/** 列表数据 */
const timeRange = ref<[string, string] | null>(null)
const requestGuard = useRequestGuard(() => null)
const rows = ref<AuditLog[]>([])
/** 总数 */
const total = ref(0)
/** 加载中 */
const loading = ref(false)
/** 错误 */
const error = ref('')

/** 查询条件；反应式对象便于整体重置 */
const query = reactive<AuditQueryParams>({
  page: 1,
  size: 20,
  userId: undefined,
  action: '',
  targetType: '',
  targetId: '',
  result: undefined,
  from: '',
  to: '',
  requestId: '',
})

/** 目标类型下拉（与后端 AuditQueryDTO 注释一致） */
const TARGET_TYPES = ['USER', 'FILE', 'VERSION', 'TASK', 'MODEL_CONFIG', 'STORAGE', 'TEMPLATE']

/** 回收预演开关：默认只预演 */
const dryRun = ref(true)
/** 回收中 */
const recycling = ref(false)
/** 最近一次回执 */
const report = ref<StorageRecycleReport | null>(null)

/** 把空字符串过滤掉，避免后端 @Size 或类型转换报错 */
function buildParams(): AuditQueryParams {
  return {
    page: query.page,
    size: query.size,
    userId: query.userId ?? undefined,
    action: query.action?.trim() || undefined,
    targetType: query.targetType?.trim() || undefined,
    targetId: query.targetId?.trim() || undefined,
    result: query.result ?? undefined,
    from: timeRange.value?.[0] || undefined,
    to: timeRange.value?.[1] || undefined,
    requestId: query.requestId?.trim() || undefined,
  }
}

/** 加载一页 */
async function load(): Promise<void> {
  const isCurrent = requestGuard()
  const params = buildParams()
  error.value = ''
  if (params.from && params.to && params.from > params.to) { error.value = '结束时间不能早于起始时间'; loading.value = false; return }
  loading.value = true
  try {
    const page = await adminAuditApi.list(params)
    if (!isCurrent()) return
    rows.value = page.records
    total.value = page.total
  } catch (e) {
    if (isCurrent()) error.value = e instanceof ApiError ? e.message : '审计日志加载失败'
  } finally {
    if (isCurrent()) loading.value = false
  }
}

/** 查询：回到第一页 */
function search(): void {
  query.page = 1
  void load()
}

/** 重置筛选条件 */
function reset(): void {
  query.page = 1
  query.userId = undefined
  query.action = ''
  query.targetType = ''
  query.targetId = ''
  query.result = undefined
  timeRange.value = null
  query.from = ''
  query.to = ''
  query.requestId = ''
  void load()
}

/** 翻页 */
function onPageChange(page: number): void {
  query.page = page
  void load()
}

/** 每页条数变化 */
function onSizeChange(size: number): void {
  query.size = size
  query.page = 1
  void load()
}

/** 执行存储回收：真正删除前二次确认 */
async function recycle(): Promise<void> {
  if (!dryRun.value) {
    try {
      await ElMessageBox.confirm(
        '这会真正删除过期文件的实际存储内容，不可撤销。确认继续？',
        '执行存储回收',
        { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  recycling.value = true
  try {
    report.value = await adminStorageApi.recycle(dryRun.value)
    ElMessage.success(dryRun.value ? '预演完成' : '回收完成')
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '存储回收失败')
  } finally {
    recycling.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="audit">
    <header class="audit__head">
      <h2 class="audit__title">审计日志</h2>
      <div class="audit__recycle">
        <el-checkbox v-model="dryRun">只预演（不删除）</el-checkbox>
        <el-button size="small" :loading="recycling" @click="recycle">存储回收</el-button>
      </div>
    </header>

    <!-- 筛选区：colspan 对齐后端 AuditQueryDTO 的过滤字段 -->
    <div class="audit__filters">
      <el-input v-model.number="query.userId" placeholder="操作者用户 ID" class="audit__w-sm" clearable />
      <el-input v-model="query.action" placeholder="动作，如 USER_DISABLE" class="audit__w-md" clearable />
      <el-select v-model="query.targetType" placeholder="目标类型" class="audit__w-md" clearable>
        <el-option v-for="item in TARGET_TYPES" :key="item" :label="item" :value="item" />
      </el-select>
      <el-input v-model="query.targetId" placeholder="目标 ID" class="audit__w-sm" clearable />
      <el-select v-model="query.result" placeholder="结果" class="audit__w-sm" clearable>
        <el-option label="SUCCESS" value="SUCCESS" />
        <el-option label="FAILURE" value="FAILURE" />
      </el-select>
      <el-input v-model="query.requestId" placeholder="请求 ID" class="audit__w-md" clearable />
      <el-date-picker v-model="timeRange" type="datetimerange" value-format="YYYY-MM-DDTHH:mm:ss"
        start-placeholder="起始时间（含）" end-placeholder="结束时间（含）" range-separator="至" clearable />
      <el-button type="primary" size="small" :loading="loading" @click="search">查询</el-button>
      <el-button size="small" @click="reset">重置</el-button>
    </div>

    <p v-if="error" class="audit__hint audit__hint--warn" role="alert">{{ error }}</p>

    <!-- 回收回执 -->
    <div v-if="report" class="audit__report">
      <p>
        {{ report.dryRun ? '预演' : '已执行' }} · 过期文件 {{ report.expiredFiles }} 个 ·
        扫描 {{ report.scannedFiles }} 个 · 删除 {{ report.deletedBlobs }} 个 ·
        释放 {{ report.deletedBytes }} 字节 ·
        剩余 {{ report.truncated ? '有（需再次运行）' : '无' }}
      </p>
      <ul v-if="report.entries.length" class="audit__report-list">
        <li v-for="entry in report.entries.slice(0, 50)" :key="entry.storageKey">
          {{ entry.storageKey }} · {{ entry.sizeBytes }} B · {{ entry.outcome }}
        </li>
      </ul>
    </div>

    <el-table :data="rows" size="small" border v-loading="loading" class="audit__table">
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
      </el-table-column>
      <el-table-column label="操作者" width="150">
        <template #default="{ row }">
          {{ row.username || '系统' }}<template v-if="row.userId"> ({{ row.userId }})</template>
        </template>
      </el-table-column>
      <el-table-column prop="action" label="动作" width="190" show-overflow-tooltip />
      <el-table-column label="目标" width="150">
        <template #default="{ row }">{{ row.targetType || '-' }}<template v-if="row.targetId"> / {{ row.targetId }}</template></template>
      </el-table-column>
      <el-table-column label="结果" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.result === 'SUCCESS' ? 'success' : 'danger'">{{ row.result }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="requestIp" label="来源 IP" width="130" show-overflow-tooltip />
      <el-table-column prop="requestId" label="请求 ID" width="180" show-overflow-tooltip />
      <el-table-column prop="detail" label="详情" min-width="220" show-overflow-tooltip />
    </el-table>

    <el-pagination
      class="audit__pager"
      background
      layout="total, sizes, prev, pager, next"
      :total="total"
      :current-page="query.page"
      :page-size="query.size"
      :page-sizes="[20, 50, 100]"
      @current-change="onPageChange"
      @size-change="onSizeChange"
    />
  </div>
</template>

<style scoped lang="scss">
.audit {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  padding: $card-padding;
}

.audit__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $gap-sm;
}

.audit__title {
  margin: 0;
  font-size: $font-size-title;
  font-weight: $weight-semibold;
}

.audit__recycle {
  display: flex;
  align-items: center;
  gap: $gap-sm;
}

.audit__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $gap-xs;
}

.audit__w-sm :deep(.el-input__wrapper),
.audit__w-sm {
  width: 150px;
}

.audit__w-md :deep(.el-input__wrapper),
.audit__w-md {
  width: 200px;
}

.audit__hint {
  margin: 0;
  font-size: $font-size-body;
  color: $ink-soft;
}

.audit__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.audit__report {
  padding: $gap-sm;
  font-size: $font-size-caption;
  color: $ink;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;

  p {
    margin: 0;
  }
}

.audit__report-list {
  margin: $gap-xs 0 0;
  padding-left: $gap-sm;
  color: $ink-soft;
}

.audit__table {
  width: 100%;
}

.audit__pager {
  align-self: flex-end;
}
</style>
