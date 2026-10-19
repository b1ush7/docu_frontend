<script setup lang="ts">
/**
 * @component DocxTocImageEditor
 * @description DOCX 目录域（API.md 4.11）与内嵌图片（4.8）编辑。
 *
 * 目录域语义：
 *   - `GET .../table-of-contents` 只返回**检测到的第一个 TOC 域**，
 *     `present=false` 表示当前版本没有目录域。
 *   - `POST` 插入或刷新目录域：`position` 默认 END、`maxLevel` 默认 3、`hyperlinks` 默认 true。
 *   - 目录域是**域代码**，实际页码要等 Word 打开时更新（`updateFieldsOnOpen`）。
 *
 * 内嵌图片语义：
 *   - 图片必须来自**已有文件的明确版本**（imageFileId + imageVersionNo），不能直接上传。
 *   - 目标 `blockId` 必须是正文或表格单元格中的段落。
 *   - 宽高 1～10000 像素；单次最多 20 张，整批只创建一个版本。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { docxApi } from '@/api/docx'
import { ApiError } from '@/api/http'
import type {
  DocBlock,
  DocxInlineImageOperation,
  DocxStructure,
  DocxTableOfContents,
  DocxTocPosition,
  Version,
} from '@/api/types'

const props = defineProps<{
  modelValue: boolean
  fileId: number | null
  versionNo: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'edited', version: Version): void
}>()

/** 内嵌图片的目标必须是正文/单元格段落 */
const BODY_PARAGRAPH = /^body(?:\/t\d+\/r\d+\/c\d+)*\/p\d+$/

const tab = ref<'toc' | 'image'>('toc')
const structure = ref<DocxStructure | null>(null)
const toc = ref<DocxTableOfContents | null>(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')

/* ---------- 目录 ---------- */
const tocPosition = ref<DocxTocPosition>('END')
const tocMaxLevel = ref(3)
const tocHyperlinks = ref(true)
const tocTitle = ref('目录')

/* ---------- 图片 ---------- */
const images = ref<DocxInlineImageOperation[]>([])

const paragraphs = computed<DocBlock[]>(
  () => (structure.value?.blocks ?? []).filter((b) => BODY_PARAGRAPH.test(b.blockId)),
)

function close(): void {
  emit('update:modelValue', false)
}

/** 加载结构与目录状态 */
async function load(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  loading.value = true
  error.value = ''
  toc.value = null
  structure.value = null
  try {
    structure.value = await docxApi.getStructure(props.fileId, props.versionNo)
    toc.value = await docxApi.getTableOfContents(props.fileId, props.versionNo)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.fileId, props.versionNo] as const,
  ([visible]) => {
    if (!visible) return
    tab.value = 'toc'
    tocPosition.value = 'END'
    tocMaxLevel.value = 3
    tocHyperlinks.value = true
    tocTitle.value = '目录'
    images.value = []
    void load()
  },
)

/** 插入或刷新目录域 */
async function submitToc(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  submitting.value = true
  try {
    const version = await docxApi.createTableOfContents(props.fileId, props.versionNo, {
      position: tocPosition.value,
      maxLevel: tocMaxLevel.value,
      hyperlinks: tocHyperlinks.value,
      title: tocTitle.value.trim() || undefined,
    })
    ElMessage.success('已创建新版本（目录页码需在 Word 中更新）')
    emit('edited', version)
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '目录操作失败'
  } finally {
    submitting.value = false
  }
}

/** 添加一条图片插入操作 */
function addImage(): void {
  if (images.value.length >= 20) {
    ElMessage.warning('单次最多插入 20 张图片')
    return
  }
  images.value.push({
    blockId: paragraphs.value[0]?.blockId ?? '',
    imageFileId: 0,
    imageVersionNo: 1,
    widthPixels: 200,
    heightPixels: 200,
  })
}

function removeImage(index: number): void {
  images.value.splice(index, 1)
}

/** 提交图片插入 */
async function submitImages(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  if (!images.value.length) {
    ElMessage.warning('还没有添加图片')
    return
  }
  const invalid = images.value.findIndex(
    (item) => !item.blockId || !item.imageFileId || !item.imageVersionNo,
  )
  if (invalid >= 0) {
    ElMessage.warning(`第 ${invalid + 1} 条：目标段落与图片文件/版本都必须填写`)
    return
  }
  submitting.value = true
  try {
    const version = await docxApi.insertInlineImages(props.fileId, props.versionNo, {
      operations: images.value,
    })
    ElMessage.success('已创建新版本')
    emit('edited', version)
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '插入图片失败'
  } finally {
    submitting.value = false
  }
}

/** 段落简短预览 */
function preview(block: DocBlock): string {
  const text = (block.text ?? '').trim()
  if (!text) return '（空段落）'
  return text.length > 30 ? `${text.slice(0, 30)}…` : text
}
</script>

<template>
  <el-dialog
    append-to-body
    :model-value="modelValue"
    title="DOCX 目录与内嵌图片"
    width="780px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="tie">
      <p v-if="error" class="tie__hint tie__hint--warn" role="alert">{{ error }}</p>
      <p v-if="loading" class="tie__hint">加载中…</p>

      <el-tabs v-if="structure" v-model="tab">
        <!-- 目录域 -->
        <el-tab-pane label="目录域" name="toc">
          <p class="tie__hint">
            接口只返回<strong>检测到的第一个 TOC 域</strong>。
            <template v-if="toc">
              当前版本：<strong>{{ toc.present ? '已有目录域' : '没有目录域' }}</strong>
              <template v-if="toc.present">
                · 块 {{ toc.blockId }} · 打开时更新 {{ toc.updateFieldsOnOpen ? '是' : '否' }}
              </template>
            </template>
          </p>
          <p class="tie__hint">
            目录是<strong>域代码</strong>，插入后页码需在 Word 中更新；整批操作只创建一个新版本。
          </p>

          <div class="tie__form">
            <label class="tie__field">
              <span>位置</span>
              <el-select v-model="tocPosition" class="tie__control">
                <el-option label="文末（END）" value="END" />
                <el-option label="文首（START）" value="START" />
              </el-select>
            </label>
            <label class="tie__field">
              <span>标题级别上限（1～9）</span>
              <el-input-number v-model="tocMaxLevel" :min="1" :max="9" />
            </label>
            <label class="tie__field">
              <span>目录标题</span>
              <el-input v-model="tocTitle" placeholder="默认「目录」，最长 100" />
            </label>
            <label class="tie__field tie__field--row">
              <el-checkbox v-model="tocHyperlinks">生成超链接</el-checkbox>
            </label>
          </div>

          <div class="tie__actions">
            <el-button size="small" @click="close">取消</el-button>
            <el-button type="primary" size="small" :loading="submitting" @click="submitToc">
              {{ toc?.present ? '刷新目录域' : '插入目录域' }}
            </el-button>
          </div>
        </el-tab-pane>

        <!-- 内嵌图片 -->
        <el-tab-pane label="内嵌图片" name="image">
          <p class="tie__hint">
            图片必须来自<strong>已有文件的明确版本</strong>（先上传图片拿到 fileId 与 versionNo），
            目标段落必须是正文或单元格段落。宽高 1～10000 像素，单次最多 20 张。
          </p>

          <div class="tie__list">
            <div v-for="(item, index) in images" :key="index" class="tie__row">
              <span class="tie__row-no">#{{ index + 1 }}</span>
              <el-select v-model="item.blockId" class="tie__target" filterable placeholder="目标段落">
                <el-option
                  v-for="block in paragraphs"
                  :key="block.blockId"
                  :label="`${block.blockId} · ${preview(block)}`"
                  :value="block.blockId"
                />
              </el-select>
              <el-input-number v-model="item.imageFileId" :min="1" placeholder="图片 fileId" />
              <el-input-number v-model="item.imageVersionNo" :min="1" placeholder="版本" />
              <el-input-number v-model="item.widthPixels" :min="1" :max="10000" placeholder="宽" />
              <el-input-number v-model="item.heightPixels" :min="1" :max="10000" placeholder="高" />
              <el-button link type="danger" size="small" @click="removeImage(index)">移除</el-button>
            </div>
          </div>

          <div class="tie__actions">
            <el-button size="small" @click="addImage">添加一张图片</el-button>
            <span class="tie__spacer" />
            <el-button size="small" @click="close">取消</el-button>
            <el-button
              type="primary"
              size="small"
              :loading="submitting"
              :disabled="!images.length"
              @click="submitImages"
            >
              提交 {{ images.length }} 张
            </el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.tie {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  max-height: 70vh;
  overflow-y: auto;
}

.tie__hint {
  margin: 0;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.tie__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.tie__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $gap-sm;
  margin-top: $gap-sm;
}

.tie__field {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.tie__field--row {
  flex-direction: row;
  align-items: center;
}

.tie__control {
  width: 100%;
}

.tie__list {
  display: flex;
  flex-direction: column;
  gap: $gap-xs;
  margin-top: $gap-sm;
  max-height: 40vh;
  overflow-y: auto;
}

.tie__row {
  display: flex;
  align-items: center;
  gap: $gap-xs;
  padding: $gap-xs $gap-sm;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
}

.tie__row-no {
  flex: none;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.tie__target {
  flex: 1;
  min-width: 0;
}

.tie__actions {
  display: flex;
  align-items: center;
  gap: $gap-sm;
  margin-top: $gap-sm;
}

.tie__spacer {
  flex: 1;
}
</style>
