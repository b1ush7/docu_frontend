<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { fileApi } from '@/api/file'
import { useNavigationBusy } from '@/composables/useEditorDraft'
import { useRequestGuard } from '@/composables/useRequestGuard'
import type { FileAsset, Version } from '@/api/types'

const props = defineProps<{ fileId: number; versionNo: number }>()
const emit = defineEmits<{ (e: 'select', value: { fileId: number; versionNo: number }): void }>()
const expanded = ref(false)
const keyword = ref('')
const files = ref<FileAsset[]>([])
const versions = ref<Version[]>([])
const selected = ref<FileAsset | null>(null)
const selectedVersion = ref(0)
const thumbnails = ref<Record<number, string>>({})
const preview = ref('')
const loading = ref(false)
const uploading = ref(false)
useNavigationBusy(() => uploading.value)
const progress = ref(0)
const error = ref('')
const page = ref(0)
const total = ref(0)
const guard = useRequestGuard(() => [expanded.value, keyword.value])
const selectionGuard = useRequestGuard(() => [expanded.value, selected.value?.id, selectedVersion.value])
const hasMore = computed(() => page.value * 20 < total.value)
const image = (extension: string) => ['png', 'jpg', 'jpeg'].includes(extension.toLowerCase())
function clearUrls(): void {
  Object.values(thumbnails.value).forEach(url => URL.revokeObjectURL(url))
  thumbnails.value = {}
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
}
onScopeDispose(clearUrls)
async function load(reset = true): Promise<void> {
  if (!reset && loading.value) return
  const current = guard()
  loading.value = true; error.value = ''
  if (reset) { clearUrls(); files.value = []; page.value = 0; total.value = 0 }
  const next = reset ? 1 : page.value + 1
  try {
    const result = await fileApi.list({ page: next, size: 20, keyword: keyword.value.trim() || undefined })
    if (!current()) return
    page.value = next; total.value = result.total
    const images = result.records.filter(file => image(file.extension))
    files.value = reset ? images : [...files.value, ...images]
    await Promise.allSettled(images.map(async file => {
      const blob = await fileApi.downloadVersion(file.id, file.latestVersion)
      if (current()) thumbnails.value[file.id] = URL.createObjectURL(blob)
    }))
  } catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : '图片列表加载失败' }
  finally { if (current()) loading.value = false }
}
async function choose(file: FileAsset): Promise<void> {
  selected.value = file; versions.value = []; selectedVersion.value = 0; error.value = ''
  const current = selectionGuard('versions')
  try {
    const result = await fileApi.versions(file.id)
    if (!current()) return
    versions.value = result.filter(version => image(version.extension))
    selectedVersion.value = versions.value.some(version => version.versionNo === props.versionNo && file.id === props.fileId)
      ? props.versionNo : (versions.value[0]?.versionNo ?? 0)
  } catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : '图片版本加载失败' }
}
watch(selectedVersion, async versionNo => {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
  if (!selected.value || !versionNo) return
  const fileId = selected.value.id
  const current = selectionGuard('preview')
  try {
    const blob = await fileApi.downloadVersion(fileId, versionNo)
    if (current()) preview.value = URL.createObjectURL(blob)
  } catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : '图片预览加载失败' }
})
watch(() => [expanded.value, keyword.value], () => {
  selected.value = null; versions.value = []; selectedVersion.value = 0
  if (expanded.value) void load()
  else { clearUrls(); loading.value = false }
})
async function upload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]; input.value = ''
  if (!file || uploading.value) return
  if (file.size > 50 * 1024 * 1024) { error.value = '图片超过 50MB 大小限制'; return }
  if (!/\.(png|jpe?g)$/i.test(file.name)) { error.value = '请选择 PNG 或 JPEG 图片'; return }
  uploading.value = true; progress.value = 0; error.value = ''
  const current = guard('upload')
  try {
    const asset = await fileApi.upload(file, percent => { if (current()) progress.value = percent })
    if (!current()) return
    if (!image(asset.extension)) { error.value = '上传内容不是受支持的图片'; return }
    emit('select', { fileId: asset.id, versionNo: asset.latestVersion })
    expanded.value = false
  } catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : '图片上传失败' }
  finally { uploading.value = false }
}
function confirm(): void {
  if (!selected.value || !selectedVersion.value) return
  emit('select', { fileId: selected.value.id, versionNo: selectedVersion.value })
  expanded.value = false
}
</script>
<template>
  <div class="asset-picker">
    <button type="button" :disabled="uploading" @click="expanded = !expanded">{{ fileId ? `图片 #${fileId} · v${versionNo}（更换）` : '选择或上传图片' }}</button>
    <section v-if="expanded" class="asset-picker__panel">
      <p>选择现有 PNG/JPEG 图片的明确版本，或上传新图片。上传后会建立独立文件。</p>
      <input v-model="keyword" maxlength="100" placeholder="搜索图片名称" aria-label="搜索图片名称" :disabled="uploading" />
      <label>上传图片 <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" :disabled="uploading" @change="upload" /></label>
      <p v-if="uploading">上传中 {{ progress }}%</p>
      <p v-if="error" role="alert">{{ error }} <button type="button" @click="load()">重新加载</button></p>
      <div class="asset-picker__grid" :inert="uploading">
        <button v-for="file in files" :key="file.id" type="button" :aria-pressed="selected?.id === file.id" @click="choose(file)">
          <img v-if="thumbnails[file.id]" :src="thumbnails[file.id]" alt="" loading="lazy" />
          <span>{{ file.displayName }}</span>
        </button>
      </div>
      <p v-if="!files.length && !loading">当前页没有 PNG/JPEG 图片，可继续加载其他页或上传。</p>
      <button v-if="hasMore" type="button" :disabled="loading || uploading" @click="load(false)">加载下一页</button>
      <p v-if="loading">正在加载图片…</p>
      <div v-if="selected" class="asset-picker__selection" :inert="uploading">
        <span>{{ selected.displayName }}</span>
        <select v-model="selectedVersion" aria-label="图片版本">
          <option :value="0" disabled>选择版本</option>
          <option v-for="version in versions" :key="version.versionNo" :value="version.versionNo">v{{ version.versionNo }} · {{ version.extension }}</option>
        </select>
        <img v-if="preview" :src="preview" alt="所选图片预览" />
        <button type="button" :disabled="!selectedVersion" @click="confirm">使用此图片版本</button>
      </div>
    </section>
  </div>
</template>
<style scoped>
.asset-picker { min-width: 180px; max-width: 100%; }
.asset-picker button, .asset-picker input, .asset-picker select { font: inherit; max-width: 100%; }
.asset-picker__panel { padding: 12px; border: 1px solid #ccc; border-radius: 6px; display: grid; gap: 10px; }
.asset-picker__panel p { margin: 0; font-size: 12px; }
.asset-picker__grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(100px,1fr)); gap: 8px; }
.asset-picker__grid button { display: flex; flex-direction: column; align-items: center; overflow-wrap: anywhere; padding: 6px; }
.asset-picker__grid button[aria-pressed="true"] { outline: 2px solid currentColor; }
.asset-picker__grid img { width: 80px; height: 65px; object-fit: contain; }
.asset-picker__selection { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.asset-picker__selection img { max-width: 220px; max-height: 160px; object-fit: contain; }
</style>
