import { computed, ref, watch } from 'vue'
import { fileApi } from '@/api/file'
import { taskApi } from '@/api/task'
import { ApiError } from '@/api/http'
import { availableTaskTypes, createTaskRequest } from '@/utils/taskSubmission'
import type { FileAsset, Task, TaskCreateParams, TaskCreateType, Version } from '@/api/types'

export function useTaskCreation() {
  const file = ref<FileAsset | null>(null)
  const versions = ref<Version[]>([])
  const versionNo = ref<number | null>(null)
  const taskType = ref<TaskCreateType>('CONVERT')
  const mode = ref<'EDITABLE' | 'LAYOUT'>('EDITABLE')
  const loading = ref(false)
  const submitting = ref(false)
  const error = ref('')
  const selectedVersion = computed(() => versions.value.find(version => version.versionNo === versionNo.value))
  const types = computed(() => availableTaskTypes(selectedVersion.value?.extension ?? ''))
  const canSubmit = computed(() => !loading.value && !submitting.value && !!selectedVersion.value
    && selectedVersion.value.versionNo === file.value?.latestVersion && types.value.includes(taskType.value))
  let sequence = 0
  let intent: { signature: string; body: TaskCreateParams } | null = null
  watch(types, supported => { if (!supported.includes(taskType.value) && supported[0]) taskType.value = supported[0] })
  async function load(fileId: number): Promise<void> {
    if (submitting.value) return
    const request = ++sequence
    loading.value = true
    file.value = null
    versions.value = []
    versionNo.value = null
    error.value = ''
    try {
      const [asset, history] = await Promise.all([fileApi.detail(fileId), fileApi.versions(fileId)])
      if (request !== sequence) return
      file.value = asset
      versions.value = history
      versionNo.value = asset.latestVersion
      const ext = history.find(version => version.versionNo === asset.latestVersion)?.extension ?? ''
      taskType.value = availableTaskTypes(ext)[0] ?? 'EXPORT'
    } catch (cause) { if (request === sequence) error.value = cause instanceof Error ? cause.message : '读取源版本失败' }
    finally { if (request === sequence) loading.value = false }
  }
  async function submit(): Promise<Task | null> {
    if (!canSubmit.value || !file.value || !selectedVersion.value) return null
    submitting.value = true
    error.value = ''
    try {
      const signature = JSON.stringify([file.value.id, versionNo.value, taskType.value, taskType.value === 'CONVERT' ? mode.value : 'PDF'])
      if (intent?.signature !== signature) {
        const key = globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random().toString(36).slice(2)}`
        intent = { signature, body: createTaskRequest(file.value.id, selectedVersion.value, taskType.value, mode.value, key) }
      }
      const task = await taskApi.create(intent.body)
      intent = null
      return task
    } catch (cause) {
      // A timeout may occur after the backend created the task. Keep its key for a safe retry.
      if (cause instanceof ApiError && cause.code >= 400 && cause.code < 500) intent = null
      error.value = cause instanceof Error ? cause.message : '创建任务失败，请重试'
      return null
    } finally { submitting.value = false }
  }
  return { file, versions, versionNo, taskType, mode, loading, submitting, error, types, canSubmit, load, submit }
}
