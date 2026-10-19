import { ref } from 'vue'
import { fileApi } from '@/api/file'
import type { FileAsset, Version } from '@/api/types'

export function useVersionHistory() {
  const file = ref<FileAsset | null>(null)
  const versions = ref<Version[]>([])
  const loading = ref(false)
  const restoring = ref(false)
  const error = ref('')
  let request = 0
  async function load(fileId: number): Promise<void> {
    if (restoring.value) return
    const current = ++request
    file.value = null
    versions.value = []
    error.value = ''
    loading.value = true
    try {
      const [asset, history] = await Promise.all([fileApi.detail(fileId), fileApi.versions(fileId)])
      if (current !== request) return
      file.value = asset
      versions.value = [...history].sort((a, b) => b.versionNo - a.versionNo)
    } catch (cause) {
      if (current === request) error.value = cause instanceof Error ? cause.message : '版本历史加载失败'
    } finally { if (current === request) loading.value = false }
  }
  async function restore(versionNo: number): Promise<Version | null> {
    if (!file.value || loading.value || restoring.value) return null
    const asset = file.value
    restoring.value = true
    error.value = ''
    try {
      const version = await fileApi.restoreVersion(asset.id, versionNo, asset.latestVersion)
      versions.value = [version, ...versions.value]
      file.value = { ...asset, latestVersion: version.versionNo, extension: version.extension,
        contentType: version.contentType, sizeBytes: version.sizeBytes }
      return version
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '恢复失败，请刷新版本列表后重试'
      return null
    } finally { restoring.value = false }
  }
  return { file, versions, loading, restoring, error, load, restore }
}
