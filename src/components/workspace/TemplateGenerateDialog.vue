<script setup lang="ts">
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/el-option-group.css'
import 'element-plus/theme-chalk/el-select.css'

import { ElDialog, ElInput, ElOption, ElSelect } from 'element-plus'

/**
 * @component TemplateGenerateDialog
 * @description 按公共模板生成新的 DOCX 文件（API.md 4.2 模板模式）。
 *
 * 关键语义（来自后端实现，勿改动假设）：
 *   1. 生成的是**新文件**，不是既有文件的新版本，所以返回 FileAsset 而不是 Version。
 *   2. 模板模式与结构块模式**不能混用**：本对话框只走模板模式（templateId + variables）。
 *   3. `variables` 在模板元数据里是 **JSON 字符串**，格式为
 *      `[{"name":"title","label":"标题","required":true,"description":"文档标题"}]`，
 *      仅 `name` 必填，且必须匹配 `^[A-Za-z_][A-Za-z0-9_]*$`。
 *   4. 变量值必须是**字面量字符串**，渲染端不解析 HTML 或表达式。
 *   5. `templateVersion` 显式传当前内容版本号，避免生成时模板被替换导致内容不一致。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { templateApi } from '@/api/template'
import { docxApi } from '@/api/docx'
import DraftNotice from './DraftNotice.vue'
import { useEditorDraft } from '@/composables/useEditorDraft'
import { useRequestGuard } from '@/composables/useRequestGuard'
import { ApiError } from '@/api/http'
import type { DocTemplate, DocTemplateVariable, FileAsset } from '@/api/types'

const props = defineProps<{
  modelValue: boolean
}>()

const requestGuard = useRequestGuard(() => [props.modelValue])

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** 生成成功后把新文件交给父组件刷新列表并选中 */
  (e: 'created', file: FileAsset): void
}>()

/** 可用模板（后端只返回已启用的） */
const templates = ref<DocTemplate[]>([])
/** 加载中 */
const loading = ref(false)
/** 生成中 */
const submitting = ref(false)
/** 错误提示 */
const error = ref('')
/** 选中模板 ID */
const selectedId = ref<number | null>(null)
/** 变量值：name → 文本 */
const values = ref<Record<string, string>>({})
/** 可选文件名与标题 */
const fileName = ref('')
const title = ref('')

const selected = computed(() => templates.value.find((t) => t.id === selectedId.value) ?? null)

/**
 * 解析当前模板的变量定义。
 * 后端在保存时已校验过结构，这里仍然防御性解析：历史数据或手工改库都可能不合规。
 */
const variables = computed<DocTemplateVariable[]>(() => {
  const raw = selected.value?.variables
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is DocTemplateVariable =>
      Boolean(item) && typeof item === 'object' && typeof (item as DocTemplateVariable).name === 'string',
    )
  } catch {
    return []
  }
})

/** 变量定义解析失败时提示（模板仍可生成，只是没有表单） */
const variablesBroken = computed(() => Boolean(selected.value?.variables) && variables.value.length === 0)

/** 必填项是否都填了 */
const missingRequired = computed(() =>
  variables.value
    .filter((v) => v.required)
    .map((v) => v.name)
    .filter((name) => !(values.value[name] ?? '').trim()),
)

/** 是否可以提交 */
const canSubmit = computed(
  () => selected.value !== null && selected.value.hasFile && missingRequired.value.length === 0 && !submitting.value,
)

function close(): void {
  emit('update:modelValue', false)
}

/** 加载已启用模板 */
async function loadTemplates(): Promise<void> {
  const isCurrent = requestGuard('loadTemplates')

  loading.value = true
  error.value = ''
  try {
    const response = await templateApi.list()
    if (!isCurrent()) return
    templates.value = response
    selectedId.value = templates.value[0]?.id ?? null
  } catch (e) {
    if (!isCurrent()) return
    error.value = e instanceof ApiError ? e.message : '模板列表加载失败'
  } finally {
    if (isCurrent()) loading.value = false
  }
}

// 打开时加载；关闭时清空表单，避免下次带出上次的值
watch(
  () => props.modelValue,
  (visible) => {
    submitting.value = false
    loading.value = false
    if (!visible) return
    selectedId.value = null
    values.value = {}
    fileName.value = ''
    title.value = ''
    error.value = ''
    void loadTemplates()
  },
  { flush: 'sync' },
)

// 切换模板时清空已填变量（不同模板的变量集合不同）
watch(selectedId, () => {
  values.value = {}
}, { flush: 'sync' })

/** 按模板生成 DOCX */
async function submit(): Promise<void> {
  if (submitting.value) return
  const isCurrent = requestGuard('submit')

  const template = selected.value
  if (!template) return
  if (missingRequired.value.length) {
    error.value = `请填写必填变量：${missingRequired.value.join('、')}`
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const file = await docxApi.generate({
      templateId: template.id,
      // 显式绑定内容版本，避免生成时模板已被替换
      templateVersion: template.versionNo,
      // 只提交有值的变量；空值不传，由模板侧决定占位行为
      variables: Object.fromEntries(
        Object.entries(values.value).filter(([, v]) => v !== ''),
      ),
      fileName: fileName.value.trim() || undefined,
      title: title.value.trim() || undefined,
    })
    if (!isCurrent()) return
    ElMessage.success('文档已生成')
    submitting.value = false
    editorDraft.saved()
    emit('created', file)
    close()
  } catch (e) {
    if (!isCurrent()) return
    // 400：模板无文件或参数不合法；404：模板不存在；422：模板内容无法渲染
    error.value = e instanceof ApiError ? e.message : '生成失败'
  } finally {
    if (isCurrent()) submitting.value = false
  }
}

const editorDraft = useEditorDraft({
  busy: () => submitting.value,
  name: 'TemplateGenerateDialog', context: () => 'template',
  enabled: () => props.modelValue && !loading.value,
  read: () => ({ selectedId: selectedId.value, values: values.value, fileName: fileName.value, title: title.value }), apply: value => { selectedId.value = value.selectedId; values.value = value.values; fileName.value = value.fileName; title.value = value.title },
})
async function requestClose(): Promise<void> {
  if (submitting.value || !(await editorDraft.confirmClose())) return
  emit('update:modelValue', false)
}
function beforeClose(done: () => void): void {
  if (!submitting.value) void editorDraft.confirmClose().then(allowed => { if (allowed) done() })
}
</script>

<template>
  <el-dialog
    :before-close="beforeClose"
    :close-on-press-escape="!submitting"
    append-to-body
    :model-value="modelValue"
    title="按模板生成文档"
    width="620px"
    :close-on-click-modal="false"
    @update:model-value="value => value ? emit('update:modelValue', true) : requestClose()"
  >
    <div class="tpl" :inert="submitting">
      <DraftNotice :draft="editorDraft" />
      <p v-if="loading" class="tpl__hint">模板加载中…</p>
      <p v-else-if="!templates.length" class="tpl__hint">
        当前没有已启用的模板。请让管理员在「模板管理」中上传并启用模板。
      </p>

      <template v-else>
        <label class="tpl__field">
          <span class="tpl__label">选择模板</span>
          <el-select v-model="selectedId" placeholder="请选择模板" class="tpl__control">
            <el-option
              v-for="item in templates"
              :key="item.id"
              :label="item.name"
              :value="item.id"
              :disabled="!item.hasFile"
            />
          </el-select>
        </label>

        <p v-if="selected?.description" class="tpl__hint">{{ selected.description }}</p>
        <p v-if="selected && !selected.hasFile" class="tpl__hint tpl__hint--warn">
          该模板尚未上传文件，不能用于生成。
        </p>
        <p v-if="variablesBroken" class="tpl__hint tpl__hint--warn">
          模板的变量定义不是合法 JSON，已跳过变量表单，可直接生成。
        </p>

        <!-- 变量表单：由模板的 variables 定义动态渲染 -->
        <template v-if="variables.length">
          <label v-for="item in variables" :key="item.name" class="tpl__field">
            <span class="tpl__label">
              {{ item.label || item.name }}
              <em v-if="item.required" class="tpl__required">*</em>
              <span class="tpl__code">{{ item.name }}</span>
            </span>
            <el-input v-model="values[item.name]" :placeholder="item.description || ''" />
          </label>
        </template>

        <label class="tpl__field">
          <span class="tpl__label">文件名<span class="tpl__code">可选</span></span>
          <el-input v-model="fileName" placeholder="留空由服务端命名" />
        </label>

        <label class="tpl__field">
          <span class="tpl__label">文档标题<span class="tpl__code">可选</span></span>
          <el-input v-model="title" placeholder="最长 1000 字符" />
        </label>

        <p v-if="error" class="tpl__hint tpl__hint--warn" role="alert">{{ error }}</p>
        <p class="tpl__hint">
          生成会新建一个文件（不是既有文件的新版本），成功后自动出现在文件列表里。
        </p>
      </template>
    </div>

    <template #footer>
      <button class="tpl__btn" type="button" @click="requestClose">取消</button>
      <button class="tpl__btn tpl__btn--primary" type="button" :disabled="!canSubmit" @click="submit">
        {{ submitting ? '生成中…' : '生成文档' }}
      </button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.tpl {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  max-height: 62vh;
  overflow-y: auto;
}

.tpl__hint {
  margin: 0;
  font-size: $font-size-body;
  color: $ink-soft;
}

.tpl__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.tpl__field {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
}

.tpl__label {
  display: flex;
  align-items: center;
  gap: $gap-xs;
  font-size: $font-size-body;
  color: $ink;
}

.tpl__required {
  color: $accent;
  font-style: normal;
  font-weight: $weight-semibold;
}

.tpl__code {
  font-family: $font-serif;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.tpl__control {
  width: 100%;
}

.tpl__btn {
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

.tpl__btn--primary {
  color: $paper-surface;
  background-color: $accent;
  border-color: $accent;

  &:hover:not(:disabled) {
    background-color: $accent-hover;
    border-color: $accent-hover;
  }
}
</style>
