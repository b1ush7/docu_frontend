<script setup lang="ts">
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import 'element-plus/theme-chalk/el-date-picker-panel.css'
import 'element-plus/theme-chalk/el-date-picker.css'

import { ElButton, ElDatePicker } from 'element-plus'

import { computed, onMounted, ref } from 'vue'
import { statisticsApi } from '@/api/statistics'
import type { StatisticsTrend, TrendPoint } from '@/api/statistics'
import { useRequestGuard } from '@/composables/useRequestGuard'

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
function recent(days: number): [string, string] {
  const start = new Date(`${today}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - days + 1)
  return [start.toISOString().slice(0, 10), today]
}
const range = ref<[string, string] | null>(recent(30))
const report = ref<StatisticsTrend | null>(null)
const loading = ref(false)
const error = ref('')
const guard = useRequestGuard(() => null)
const metrics: { key: keyof Omit<TrendPoint, 'date'>; label: string; color: string }[] = [
  { key: 'newUsers', label: '新增用户', color: '#4c6a88' },
  { key: 'uploadedFiles', label: '新增文件', color: '#668154' },
  { key: 'createdTasks', label: '新增任务', color: '#946638' },
  { key: 'succeededTasks', label: '成功任务', color: '#547e75' },
  { key: 'failedTasks', label: '失败任务', color: '#a04747' },
]
const selected = ref(metrics.map(metric => metric.key))
const visibleMetrics = computed(() => metrics.filter(metric => selected.value.includes(metric.key)))
const peak = computed(() => Math.max(1, ...(report.value?.points.flatMap(point => visibleMetrics.value.map(metric => point[metric.key])) ?? [])))
function line(key: keyof Omit<TrendPoint, 'date'>): string {
  const points = report.value?.points ?? []
  return points.map((point, index) => `${40 + index * 660 / Math.max(1, points.length - 1)},${180 - point[key] * 150 / peak.value}`).join(' ')
}
async function load(): Promise<void> {
  const current = guard()
  error.value = ''; report.value = null
  const [from, to] = range.value ?? []
  const span = (Date.parse(to ?? '') - Date.parse(from ?? '')) / 86400000
  if (!from || !to || !Number.isFinite(span) || span < 0 || span >= 93 || to > today) {
    error.value = '请选择不超过 93 天且不晚于今天的有效日期范围'; loading.value = false; return
  }
  loading.value = true
  try { const value = await statisticsApi.trend(from, to); if (current()) report.value = value }
  catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : '趋势加载失败' }
  finally { if (current()) loading.value = false }
}
function quick(days: number): void { range.value = recent(days); void load() }
onMounted(load)
</script>

<template>
  <section class="trend" aria-label="按日使用趋势">
    <h3>按日使用趋势</h3>
    <div class="trend__filters">
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" />
      <el-button :loading="loading" @click="load">查询</el-button>
      <el-button v-for="days in [7,30,90]" :key="days" @click="quick(days)">近 {{ days }} 天</el-button>
    </div>
    <p>按创建日期归类，包含已删除文件记录；成功和失败任务反映这些任务的当前状态。日期口径为上海时间。</p>
    <p v-if="error" role="alert">{{ error }} <el-button link @click="load">重试</el-button></p>
    <p v-else-if="loading">趋势加载中…</p>
    <template v-else-if="report">
      <div class="trend__legend">
        <label v-for="metric in metrics" :key="metric.key" :style="{ color: metric.color }"><input v-model="selected" type="checkbox" :value="metric.key" />{{ metric.label }}</label>
      </div>
      <svg viewBox="0 0 720 210" role="img" aria-label="每日新增用户、文件及任务数量折线图；详细数据见下方表格">
        <line x1="40" y1="180" x2="700" y2="180" stroke="currentColor" />
        <text x="2" y="30" font-size="12">{{ peak }}</text><text x="20" y="180" font-size="12">0</text>
        <polyline v-for="metric in visibleMetrics" :key="metric.key" :points="line(metric.key)" :stroke="metric.color" fill="none" stroke-width="2" />
        <text x="40" y="204" font-size="12">{{ report.from }}</text><text x="700" y="204" text-anchor="end" font-size="12">{{ report.to }}</text>
      </svg>
      <details><summary>查看逐日数据</summary>
        <div class="trend__table"><table><thead><tr><th>日期</th><th v-for="metric in metrics" :key="metric.key">{{ metric.label }}</th></tr></thead>
          <tbody><tr v-for="point in report.points" :key="point.date"><td>{{ point.date }}</td><td v-for="metric in metrics" :key="metric.key">{{ point[metric.key] }}</td></tr></tbody>
        </table></div>
      </details>
    </template>
  </section>
</template>
<style scoped>
.trend { margin-top: 24px; padding: 16px; border: 1px solid var(--line); border-radius: 4px; }
.trend__filters, .trend__legend { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.trend p { font-size: 13px; color: var(--ink-soft); }
.trend svg { width: 100%; max-height: 300px; }
.trend__table { overflow: auto; max-height: 360px; }
.trend table { width: 100%; border-collapse: collapse; }
.trend th, .trend td { border: 1px solid var(--line); padding: 6px; white-space: nowrap; }
</style>
