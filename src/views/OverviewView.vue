<template>
  <div class="page-card">
    <div class="page-header">
      <span class="page-title">概览统计</span>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
    </div>

    <!-- 首次加载骨架屏；刷新时保留旧数据 -->
    <el-skeleton v-if="loading && !data" :rows="8" animated />

    <!-- 错误占位：请求以 silent 方式发出，错误提示只在页面内展示 -->
    <el-result v-else-if="errorMsg" icon="error" title="数据加载失败" :sub-title="errorMsg">
      <template #extra>
        <el-button type="primary" @click="load">重试</el-button>
      </template>
    </el-result>

    <el-row v-else-if="data" :gutter="16">
      <!-- 用户 -->
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <template #header><span class="card-title">用户</span></template>
          <div class="stat-grid">
            <div class="stat-item">
              <div class="stat-value">{{ data.totalUsers }}</div>
              <div class="stat-label">总用户数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ data.enabledUsers }}</div>
              <div class="stat-label">已启用</div>
            </div>
            <div class="stat-item">
              <div class="stat-value danger">{{ data.disabledUsers }}</div>
              <div class="stat-label">已禁用</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ data.adminUsers }}</div>
              <div class="stat-label">管理员</div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 文件 -->
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <template #header><span class="card-title">文件</span></template>
          <div class="stat-grid">
            <div class="stat-item">
              <div class="stat-value">{{ data.activeFiles }}</div>
              <div class="stat-label">在用文件</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ data.deletedFiles }}</div>
              <div class="stat-label">已删除文件</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ formatBytes(data.storageBytes) }}</div>
              <div class="stat-label">存储占用</div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 任务 -->
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <template #header><span class="card-title">任务</span></template>
          <div class="stat-grid">
            <div class="stat-item">
              <div class="stat-value">{{ data.totalTasks }}</div>
              <div class="stat-label">总任务数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ data.pendingTasks }}</div>
              <div class="stat-label">排队中</div>
            </div>
            <div class="stat-item">
              <div class="stat-value primary">{{ data.runningTasks }}</div>
              <div class="stat-label">执行中</div>
            </div>
            <div class="stat-item">
              <div class="stat-value success">{{ data.succeededTasks }}</div>
              <div class="stat-label">已成功</div>
            </div>
            <!-- 失败任务可点击，跳转任务管理页并带 status=FAILED 筛选 -->
            <div class="stat-item clickable" title="点击查看失败任务" @click="goFailedTasks">
              <div class="stat-value danger">{{ data.failedTasks }}</div>
              <div class="stat-label">失败任务</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ data.cancelledTasks }}</div>
              <div class="stat-label">已取消</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ formatPercent(data.taskFailureRate) }}</div>
              <div class="stat-label">任务失败率</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { getOverview } from '../api/admin'
import { formatBytes, formatPercent } from '../utils/format'

const router = useRouter()
const loading = ref(false)
const data = ref(null)
const errorMsg = ref('')

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await getOverview({ silent: true })
    data.value = res.data
  } catch (err) {
    errorMsg.value = err.message || '数据加载失败'
  } finally {
    loading.value = false
  }
}

function goFailedTasks() {
  router.push({ path: '/admin/tasks', query: { status: 'FAILED' } })
}

load()
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
}
.stat-card {
  min-height: 220px;
}
.card-title {
  font-weight: 600;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 12px;
}
.stat-item {
  padding: 4px 8px;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}
.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 2px;
}
.stat-value.danger {
  color: #f56c6c;
}
.stat-value.success {
  color: #67c23a;
}
.stat-value.primary {
  color: #409eff;
}
.stat-item.clickable {
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}
.stat-item.clickable:hover {
  background: #f5f7fa;
}
</style>
