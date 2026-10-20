<script setup lang="ts">
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-input-number.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/el-option-group.css'
import 'element-plus/theme-chalk/el-select.css'

import { ElDialog, ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'

/**
 * @component ImageEditDialog
 * @description PNG/JPEG 的受控像素编辑与格式转换（API.md 3.20）。
 *
 * 关键语义（来自后端 EditImageDTO，勿改动假设）：
 *   1. 操作**按数组顺序依次作用在同一张图**上，所以顺序会影响结果（先裁剪再旋转 ≠ 先旋转再裁剪）。
 *   2. 单次最多 20 个操作；每次提交都会**创建一个新版本**。
 *   3. `outputFormat` 只能是 PNG 或 JPEG；`jpegQuality` 仅在 JPEG 时生效，范围 0.1～1.0。
 *   4. 旋转只支持 90 / 180 / 270（顺时针）；亮度是 RGB 乘数，0 为全黑、1 为原值、最大 4，不影响 alpha。
 *   5. 加水印文字是单行纯文本，**不解析 HTML、脚本或字体路径**，颜色必须是 `#RRGGBB`。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { fileApi } from '@/api/file'
import { useRequestGuard } from '@/composables/useRequestGuard'
import { ApiError } from '@/api/http'
import type { ImageEditOperation, ImageEditType, Version } from '@/api/types'

const props = defineProps<{
  modelValue: boolean
  fileId: number | null
  versionNo: number | null
}>()

const requestGuard = useRequestGuard(() => [props.modelValue, props.fileId, props.versionNo])

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** 编辑成功，交给父组件切换到新版本预览 */
  (e: 'edited', version: Version): void
}>()

/** 一行操作草稿；字段全部可选，按 type 决定哪些生效 */
interface Draft extends Omit<ImageEditOperation, 'type'> {
  type: ImageEditType
}

/** 操作列表 */
const operations = ref<Draft[]>([])
/** 输出格式 */
const outputFormat = ref<'PNG' | 'JPEG'>('PNG')
/** JPEG 质量（0.1～1.0） */
const jpegQuality = ref(0.9)
/** 提交中 */
const submitting = ref(false)
/** 错误提示 */
const error = ref('')

/** 可选操作类型 */
const TYPES: Array<{ value: ImageEditType; label: string }> = [
  { value: 'CROP', label: '裁剪' },
  { value: 'RESIZE', label: '缩放' },
  { value: 'ROTATE', label: '旋转' },
  { value: 'BRIGHTNESS', label: '亮度' },
  { value: 'ADD_TEXT', label: '添加文字' },
]

/** 是否达到操作上限 */
const atLimit = computed(() => operations.value.length >= 20)

function close(): void {
  emit('update:modelValue', false)
}

/** 新增一个操作 */
function addOperation(): void {
  if (atLimit.value) return
  operations.value.push({ type: 'CROP', x: 0, y: 0, width: 100, height: 100 })
}

/** 删除指定操作 */
function removeOperation(index: number): void {
  operations.value.splice(index, 1)
}

/** 上移/下移：顺序会改变结果，必须让用户能调整 */
function moveOperation(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= operations.value.length) return
  const [item] = operations.value.splice(index, 1)
  operations.value.splice(target, 0, item)
}

/** 切换类型时保留通用字段，避免用户重复填写 */
function onTypeChange(): void {
  // 无需特殊处理：未使用的字段后端会忽略
}

// 打开时重置
watch(
  () => [props.modelValue, props.fileId, props.versionNo] as const,
  ([visible]) => {
    submitting.value = false
    if (!visible) return
    operations.value = []
    outputFormat.value = 'PNG'
    jpegQuality.value = 0.9
    error.value = ''
  },
  { flush: 'sync' },
)

/** 提交编辑 */
async function submit(): Promise<void> {
  if (submitting.value) return
  const isCurrent = requestGuard('submit')
  const fileId = props.fileId
  const versionNo = props.versionNo

  if (fileId === null || versionNo === null) return
  if (!operations.value.length) {
    error.value = '至少添加一个操作'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const version = await fileApi.editImage(fileId, versionNo, {
      outputFormat: outputFormat.value,
      jpegQuality: outputFormat.value === 'JPEG' ? jpegQuality.value : undefined,
      operations: operations.value as ImageEditOperation[],
    })
    if (!isCurrent()) return
    ElMessage.success('已生成新版本')
    emit('edited', version)
    close()
  } catch (e) {
    if (!isCurrent()) return
    // 415：不是图片；422：图片损坏或参数不可执行；400：操作不合法
    error.value = e instanceof ApiError ? e.message : '图片编辑失败'
  } finally {
    if (isCurrent()) submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    append-to-body
    :model-value="modelValue"
    title="图片编辑"
    width="720px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="img">
      <p class="img__hint">
        操作<strong>按顺序依次执行</strong>，顺序会影响结果（先裁剪再旋转 ≠ 先旋转再裁剪）。单次最多 20 个操作，提交后创建一个新版本。
      </p>

      <div class="img__row">
        <label class="img__field">
          <span class="img__label">输出格式</span>
          <el-select v-model="outputFormat" class="img__control">
            <el-option label="PNG" value="PNG" />
            <el-option label="JPEG" value="JPEG" />
          </el-select>
        </label>
        <label v-if="outputFormat === 'JPEG'" class="img__field">
          <span class="img__label">JPEG 质量（0.1～1.0）</span>
          <el-input-number v-model="jpegQuality" :min="0.1" :max="1" :step="0.05" :precision="2" />
        </label>
      </div>

      <div class="img__ops">
        <div v-for="(op, index) in operations" :key="index" class="img__op">
          <div class="img__op-head">
            <span class="img__op-index">#{{ index + 1 }}</span>
            <el-select v-model="op.type" class="img__op-type" @change="onTypeChange">
              <el-option v-for="t in TYPES" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
            <button class="img__mini" type="button" :disabled="index === 0" @click="moveOperation(index, -1)">上移</button>
            <button class="img__mini" type="button" :disabled="index === operations.length - 1" @click="moveOperation(index, 1)">下移</button>
            <button class="img__mini" type="button" @click="removeOperation(index)">删除</button>
          </div>

          <!-- 裁剪 -->
          <div v-if="op.type === 'CROP'" class="img__op-body">
            <label class="img__field"><span class="img__label">x</span><el-input-number v-model="op.x" :min="0" /></label>
            <label class="img__field"><span class="img__label">y</span><el-input-number v-model="op.y" :min="0" /></label>
            <label class="img__field"><span class="img__label">宽</span><el-input-number v-model="op.width" :min="1" /></label>
            <label class="img__field"><span class="img__label">高</span><el-input-number v-model="op.height" :min="1" /></label>
          </div>

          <!-- 缩放 -->
          <div v-else-if="op.type === 'RESIZE'" class="img__op-body">
            <label class="img__field"><span class="img__label">宽</span><el-input-number v-model="op.width" :min="1" /></label>
            <label class="img__field"><span class="img__label">高</span><el-input-number v-model="op.height" :min="1" /></label>
          </div>

          <!-- 旋转 -->
          <div v-else-if="op.type === 'ROTATE'" class="img__op-body">
            <label class="img__field">
              <span class="img__label">角度（顺时针）</span>
              <el-select v-model="op.degrees" class="img__control">
                <el-option :value="90" label="90°" />
                <el-option :value="180" label="180°" />
                <el-option :value="270" label="270°" />
              </el-select>
            </label>
          </div>

          <!-- 亮度 -->
          <div v-else-if="op.type === 'BRIGHTNESS'" class="img__op-body">
            <label class="img__field">
              <span class="img__label">亮度乘数（0 全黑 / 1 原值 / 4 最亮）</span>
              <el-input-number v-model="op.factor" :min="0" :max="4" :step="0.1" :precision="2" />
            </label>
          </div>

          <!-- 文字 -->
          <div v-else class="img__op-body">
            <label class="img__field">
              <span class="img__label">文字（单行，最多 500 字符）</span>
              <el-input v-model="op.text" maxlength="500" />
            </label>
            <label class="img__field"><span class="img__label">字号</span><el-input-number v-model="op.fontSize" :min="1" :max="512" /></label>
            <label class="img__field">
              <span class="img__label">颜色（#RRGGBB）</span>
              <el-input v-model="op.color" placeholder="#000000" />
            </label>
            <label class="img__field"><span class="img__label">x</span><el-input-number v-model="op.x" :min="0" /></label>
            <label class="img__field"><span class="img__label">y</span><el-input-number v-model="op.y" :min="0" /></label>
          </div>
        </div>
      </div>

      <button class="img__btn" type="button" :disabled="atLimit" @click="addOperation">
        {{ atLimit ? '已达 20 个操作上限' : '添加操作' }}
      </button>

      <p v-if="error" class="img__hint img__hint--warn" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <button class="img__btn" type="button" @click="close">取消</button>
      <button class="img__btn img__btn--primary" type="button" :disabled="submitting || !operations.length" @click="submit">
        {{ submitting ? '提交中…' : '生成新版本' }}
      </button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.img {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  max-height: 64vh;
  overflow-y: auto;
}

.img__hint {
  margin: 0;
  font-size: $font-size-body;
  color: $ink-soft;
}

.img__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.img__row {
  display: flex;
  flex-wrap: wrap;
  gap: $gap-sm;
}

.img__field {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  min-width: 120px;
}

.img__label {
  font-size: $font-size-caption;
  color: $ink-soft;
}

.img__control {
  width: 100%;
}

.img__ops {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
}

.img__op {
  padding: $gap-sm;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
}

.img__op-head {
  display: flex;
  align-items: center;
  gap: $gap-xs;
  margin-bottom: $gap-xs;
}

.img__op-index {
  font-size: $font-size-caption;
  color: $ink-soft;
}

.img__op-type {
  width: 140px;
}

.img__op-body {
  display: flex;
  flex-wrap: wrap;
  gap: $gap-sm;
}

.img__btn,
.img__mini {
  height: $control-height;
  padding: 0 $card-padding;
  font: inherit;
  font-size: $font-size-body;
  color: $ink;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: $ink-soft;
  }

  &:disabled {
    opacity: $disabled-opacity;
    cursor: default;
  }
}

.img__mini {
  height: 28px;
  padding: 0 $gap-sm;
  font-size: $font-size-caption;
}

.img__btn--primary {
  color: $paper-surface;
  background-color: $accent;
  border-color: $accent;

  &:hover:not(:disabled) {
    background-color: $accent-hover;
    border-color: $accent-hover;
  }
}
</style>
