<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { fileApi } from '@/api/file'
import { previewApi } from '@/api/preview'
import { useVersionHistory } from '@/composables/useVersionHistory'
import { saveBlob, versionFileName } from '@/utils/download'
import { formatBytes, formatTime } from '@/utils/format'
import type { FileAsset, Version, VersionCompareResult } from '@/api/types'

const props = defineProps<{ modelValue: boolean; fileId: number | null }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  preview: [file: FileAsset, version: Version]
  restored: [file: FileAsset, version: Version]
}>()
const history = useVersionHistory()
const downloading = ref<number | null>(null)
const fromVersion = ref<number | null>(null)
const toVersion = ref<number | null>(null)
const comparison = ref<VersionCompareResult | null>(null)
const comparing = ref(false)
const compareError = ref('')
let comparisonRequest = 0
const busy = computed(() => history.restoring.value || downloading.value !== null)
const comparisonSupported = computed(() => {
  const a = history.versions.value.find(v => v.versionNo === fromVersion.value)
  const b = history.versions.value.find(v => v.versionNo === toVersion.value)
  return !!a && !!b && a.versionNo !== b.versionNo && a.extension === b.extension && ['docx', 'xlsx'].includes(a.extension)
})
async function refresh(): Promise<void> {
  if (props.fileId === null || busy.value) return
  comparisonRequest++
  comparing.value = false
  comparison.value = null
  compareError.value = ''
  await history.load(props.fileId)
  toVersion.value = history.versions.value[0]?.versionNo ?? null
  fromVersion.value = history.versions.value[1]?.versionNo ?? null
}
watch(() => [props.modelValue, props.fileId], () => {
  if (props.modelValue) void refresh()
  else { comparisonRequest++; comparison.value = null; comparing.value = false }
}, { immediate: true })
watch([fromVersion, toVersion], () => { comparisonRequest++; comparison.value = null; compareError.value = ''; comparing.value = false })
async function download(version: Version): Promise<void> {
  if (!history.file.value || busy.value) return
  downloading.value = version.versionNo
  history.error.value = ''
  try {
    const blob = await fileApi.downloadVersion(history.file.value.id, version.versionNo)
    saveBlob(blob, versionFileName(history.file.value.displayName, version.versionNo, version.extension))
  } catch (error) { history.error.value = error instanceof Error ? error.message : '下载失败' }
  finally { downloading.value = null }
}
async function restore(version: Version): Promise<void> {
  if (busy.value) return
  try { await ElMessageBox.confirm(`将第 ${version.versionNo} 版恢复为一个新版本，现有历史会保留。继续吗？`, '恢复历史版本', { type: 'warning' }) }
  catch { return }
  const result = await history.restore(version.versionNo)
  if (result && history.file.value) emit('restored', history.file.value, result)
}
async function compare(): Promise<void> {
  if (!history.file.value || !comparisonSupported.value || fromVersion.value === null || toVersion.value === null) return
  const request = ++comparisonRequest
  comparing.value = true
  compareError.value = ''
  try {
    const result = await previewApi.compare(history.file.value.id, fromVersion.value, toVersion.value)
    if (request === comparisonRequest) comparison.value = result
  } catch (error) { if (request === comparisonRequest) compareError.value = error instanceof Error ? error.message : '比较失败' }
  finally { if (request === comparisonRequest) comparing.value = false }
}
function close(): void { if (!busy.value) emit('update:modelValue', false) }
function updateVisible(value: boolean): void { if (!busy.value) emit('update:modelValue', value) }
</script>

<template>
  <el-dialog append-to-body :model-value="modelValue" :title="`版本历史${history.file.value ? ' · ' + history.file.value.displayName : ''}`"
    width="min(960px, 94vw)" :before-close="close" :close-on-click-modal="!busy" @update:model-value="updateVisible">
    <el-button :loading="history.loading.value" :disabled="busy" @click="refresh">刷新版本</el-button>
    <p v-if="history.error.value" role="alert">{{ history.error.value }}；如有版本冲突，请先刷新列表。</p>
    <el-table :data="history.versions.value" v-loading="history.loading.value" max-height="360">
      <el-table-column label="版本" width="100"><template #default="{ row }">v{{ row.versionNo }} <small v-if="row.versionNo === history.file.value?.latestVersion">最新</small></template></el-table-column>
      <el-table-column prop="extension" label="格式" width="80" />
      <el-table-column label="大小" width="100"><template #default="{ row }">{{ formatBytes(row.sizeBytes) }}</template></el-table-column>
      <el-table-column prop="resultSummary" label="变更说明" min-width="140" />
      <el-table-column label="时间" width="130"><template #default="{ row }">{{ formatTime(row.createTime) }}</template></el-table-column>
      <el-table-column label="操作" width="210"><template #default="{ row }">
        <el-button link :disabled="busy" @click="history.file.value && emit('preview', history.file.value, row)">打开</el-button>
        <el-button link :disabled="busy" :loading="downloading === row.versionNo" @click="download(row)">下载</el-button>
        <el-button link :disabled="busy || row.versionNo === history.file.value?.latestVersion" @click="restore(row)">恢复</el-button>
      </template></el-table-column>
    </el-table>
    <section v-if="history.versions.value.length > 1" class="version-comparison">
      <p>选择两个同格式 DOCX/XLSX 版本比较内容；字体和图片尺寸请查看版面预览。</p>
      <el-select v-model="fromVersion" aria-label="比较基准版本" style="width: 130px"><el-option v-for="version in history.versions.value" :key="version.versionNo" :value="version.versionNo" :label="`基准 v${version.versionNo}`" /></el-select>
      <el-select v-model="toVersion" aria-label="比较目标版本" style="width: 130px"><el-option v-for="version in history.versions.value" :key="version.versionNo" :value="version.versionNo" :label="`目标 v${version.versionNo}`" /></el-select>
      <el-button :disabled="!comparisonSupported || comparing || busy" :loading="comparing" @click="compare">比较版本</el-button>
      <p v-if="compareError" role="alert">{{ compareError }}</p>
      <template v-if="comparison">
        <p>{{ comparison.changes.length }} 处内容差异 <strong v-if="comparison.truncated">（结果已截断）</strong></p>
        <el-table :data="comparison.changes" max-height="240">
          <el-table-column prop="label" label="位置" /><el-table-column prop="before" label="修改前" /><el-table-column prop="after" label="修改后" />
        </el-table>
      </template>
    </section>
  </el-dialog>
</template>

<style scoped>
.version-comparison { margin-top: 20px; }
p { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
