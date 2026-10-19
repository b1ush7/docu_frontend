<script setup lang="ts">
import { watch } from 'vue'
import { useTaskCreation } from '@/composables/useTaskCreation'
import type { Task } from '@/api/types'

const props = defineProps<{ modelValue: boolean; fileId: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [task: Task] }>()
const creation = useTaskCreation()
function beforeClose(done: () => void): void { if (!creation.submitting.value) done() }
function updateVisible(value: boolean): void { if (!creation.submitting.value) emit('update:modelValue', value) }
watch(() => [props.modelValue, props.fileId], () => {
  if (props.modelValue && props.fileId !== null) void creation.load(props.fileId)
}, { immediate: true })
async function submit(): Promise<void> {
  const task = await creation.submit()
  if (task) { emit('created', task); emit('update:modelValue', false) }
}
</script>

<template>
  <el-dialog append-to-body :model-value="modelValue" title="转换／导出任务" width="min(520px, 94vw)"
    :close-on-click-modal="!creation.submitting.value" :show-close="!creation.submitting.value"
    :before-close="beforeClose" @update:model-value="updateVisible">
    <div v-loading="creation.loading.value">
      <p>{{ creation.file.value?.displayName || '读取文件中…' }}</p>
      <el-form label-position="top">
        <el-form-item label="输入版本">
          <el-select v-model="creation.versionNo.value" :disabled="creation.submitting.value" aria-label="输入版本">
            <el-option v-for="version in creation.versions.value" :key="version.versionNo" :value="version.versionNo"
              :disabled="version.versionNo !== creation.file.value?.latestVersion" :label="`v${version.versionNo} · ${version.extension}${version.versionNo === creation.file.value?.latestVersion ? '（最新）' : ''}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作">
          <el-select v-model="creation.taskType.value" :disabled="creation.submitting.value || !creation.types.value.length" aria-label="转换操作">
            <el-option v-for="type in creation.types.value" :key="type" :value="type" :label="type === 'CONVERT' ? 'PDF → DOCX' : '导出为 PDF 新版本'" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="creation.taskType.value === 'CONVERT'" label="转换方式">
          <el-radio-group v-model="creation.mode.value" :disabled="creation.submitting.value"><el-radio value="EDITABLE">优先可编辑</el-radio><el-radio value="LAYOUT">优先保持版式</el-radio></el-radio-group>
        </el-form-item>
      </el-form>
      <p v-if="!creation.loading.value && !creation.types.value.length">当前格式没有可用的转换／导出任务。</p>
      <p>任务以明确的最新版本执行，成功后生成新版本。要转换历史内容，请先在版本历史中恢复。扫描 PDF 的识别效果取决于后端 OCR 配置。</p>
      <p v-if="creation.error.value" role="alert">{{ creation.error.value }}</p>
    </div>
    <template #footer>
      <el-button :disabled="creation.submitting.value || creation.loading.value" @click="fileId !== null && creation.load(fileId)">刷新源版本</el-button>
      <el-button type="primary" :disabled="!creation.canSubmit.value" :loading="creation.submitting.value" @click="submit">提交任务</el-button>
    </template>
  </el-dialog>
</template>
