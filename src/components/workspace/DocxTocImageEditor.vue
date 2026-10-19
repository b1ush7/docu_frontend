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
  DocxFootnoteEditOperation,
  DocxFootnotes,
  DocxHeaderFooterLinks,
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

/* ---------- 页眉页脚 ---------- */
const hfLinks = ref<DocxHeaderFooterLinks | null>(null)
const hfSectionNo = ref(1)
const hfLocation = ref<'HEADER' | 'FOOTER'>('HEADER')
const hfType = ref<'DEFAULT' | 'FIRST' | 'EVEN'>('DEFAULT')
const hfLinked = ref(true)
const hfText = ref('')

/* ---------- 脚注 ---------- */
const footnotes = ref<DocxFootnotes | null>(null)
const fnType = ref<'ADD' | 'UPDATE' | 'DELETE'>('ADD')
const fnTargetBlockId = ref('')
const fnId = ref<number | null>(null)
const fnText = ref('')

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
    // 页眉页脚与脚注都是只读查询，失败不应阻断整个对话框
    hfLinks.value = await docxApi.getHeaderFooterLinks(props.fileId, props.versionNo).catch(() => null)
    footnotes.value = await docxApi.getFootnotes(props.fileId, props.versionNo).catch(() => null)
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

/** 提交页眉页脚链接设置 */
async function submitHf(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  // 取消链接时后端要求给 text；重新链接时必须不传
  if (!hfLinked.value && !hfText.value.trim()) {
    ElMessage.warning('取消链接需要填写页眉页脚文本')
    return
  }
  submitting.value = true
  try {
    const version = await docxApi.updateHeaderFooterLink(props.fileId, props.versionNo, {
      sectionNo: hfSectionNo.value,
      location: hfLocation.value,
      type: hfType.value,
      linkedToPrevious: hfLinked.value,
      text: hfLinked.value ? undefined : hfText.value,
    })
    ElMessage.success('已创建新版本')
    emit('edited', version)
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '页眉页脚设置失败'
  } finally {
    submitting.value = false
  }
}

/** 提交脚注操作 */
async function submitFootnote(): Promise<void> {
  if (props.fileId === null || props.versionNo === null) return
  const op: DocxFootnoteEditOperation = { type: fnType.value }
  if (fnType.value === 'ADD') {
    if (!fnTargetBlockId.value) {
      ElMessage.warning('新增脚注必须选择引用段落')
      return
    }
    if (!fnText.value.trim()) {
      ElMessage.warning('新增脚注必须填写内容')
      return
    }
    op.targetBlockId = fnTargetBlockId.value
    op.text = fnText.value
  } else {
    if (fnId.value === null) {
      ElMessage.warning('修改或删除必须填写脚注 ID')
      return
    }
    op.footnoteId = fnId.value
    if (fnType.value === 'UPDATE') {
      if (!fnText.value.trim()) {
        ElMessage.warning('修改脚注必须填写新内容')
        return
      }
      op.text = fnText.value
    }
  }
  submitting.value = true
  try {
    const version = await docxApi.editFootnotes(props.fileId, props.versionNo, { operations: [op] })
    ElMessage.success('已创建新版本')
    emit('edited', version)
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '脚注操作失败'
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

        <!-- 页眉页脚链接 -->
        <el-tab-pane label="页眉页脚" name="hf">
          <p class="tie__hint">
            第一节没有上一节，所以全部 linked 状态为 false。
            <strong>取消链接时必须填写文本；重新链接时不传文本。</strong>
          </p>
          <el-table v-if="hfLinks" :data="hfLinks.sections" size="small" border max-height="200">
            <el-table-column prop="sectionNo" label="分节" width="70" />
            <el-table-column label="页眉（默认/首页/偶数）" min-width="180">
              <template #default="{ row }">
                {{ row.defaultHeaderLinked ? '链' : '断' }} / {{ row.firstHeaderLinked ? '链' : '断' }} /
                {{ row.evenHeaderLinked ? '链' : '断' }}
              </template>
            </el-table-column>
            <el-table-column label="页脚（默认/首页/偶数）" min-width="180">
              <template #default="{ row }">
                {{ row.defaultFooterLinked ? '链' : '断' }} / {{ row.firstFooterLinked ? '链' : '断' }} /
                {{ row.evenFooterLinked ? '链' : '断' }}
              </template>
            </el-table-column>
          </el-table>
          <p v-else class="tie__hint">页眉页脚状态读取失败或不可用。</p>

          <div class="tie__form">
            <label class="tie__field">
              <span>分节序号（1～1000）</span>
              <el-input-number v-model="hfSectionNo" :min="1" :max="1000" />
            </label>
            <label class="tie__field">
              <span>位置</span>
              <el-select v-model="hfLocation" class="tie__control">
                <el-option label="页眉 HEADER" value="HEADER" />
                <el-option label="页脚 FOOTER" value="FOOTER" />
              </el-select>
            </label>
            <label class="tie__field">
              <span>类型</span>
              <el-select v-model="hfType" class="tie__control">
                <el-option label="默认 DEFAULT" value="DEFAULT" />
                <el-option label="首页 FIRST" value="FIRST" />
                <el-option label="偶数 EVEN" value="EVEN" />
              </el-select>
            </label>
            <label class="tie__field tie__field--row">
              <el-checkbox v-model="hfLinked">链接到上一节</el-checkbox>
            </label>
            <label v-if="!hfLinked" class="tie__field tie__field--full">
              <span>页眉页脚文本（取消链接时必填）</span>
              <el-input v-model="hfText" type="textarea" :rows="2" />
            </label>
          </div>

          <div class="tie__actions">
            <el-button size="small" @click="close">取消</el-button>
            <el-button type="primary" size="small" :loading="submitting" @click="submitHf">提交设置</el-button>
          </div>
        </el-tab-pane>

        <!-- 脚注 -->
        <el-tab-pane label="脚注" name="fn">
          <p class="tie__hint">
            只列出<strong>被正文引用且可安全识别</strong>的脚注。新增必须选引用段落；修改/删除必须填脚注 ID。
          </p>
          <el-table v-if="footnotes" :data="footnotes.footnotes" size="small" border max-height="200">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="text" label="内容" min-width="220" show-overflow-tooltip />
            <el-table-column label="引用段落" min-width="200">
              <template #default="{ row }">{{ (row.referencedBy ?? []).join('，') || '-' }}</template>
            </el-table-column>
          </el-table>
          <p v-else class="tie__hint">脚注读取失败或当前版本没有脚注。</p>

          <div class="tie__form">
            <label class="tie__field">
              <span>操作</span>
              <el-select v-model="fnType" class="tie__control">
                <el-option label="新增 ADD" value="ADD" />
                <el-option label="修改 UPDATE" value="UPDATE" />
                <el-option label="删除 DELETE" value="DELETE" />
              </el-select>
            </label>
            <label v-if="fnType === 'ADD'" class="tie__field">
              <span>引用段落</span>
              <el-select v-model="fnTargetBlockId" class="tie__control" filterable placeholder="正文段落">
                <el-option
                  v-for="block in paragraphs"
                  :key="block.blockId"
                  :label="`${block.blockId} · ${preview(block)}`"
                  :value="block.blockId"
                />
              </el-select>
            </label>
            <label v-else class="tie__field">
              <span>脚注 ID</span>
              <el-input-number v-model="fnId" :min="1" />
            </label>
            <label v-if="fnType !== 'DELETE'" class="tie__field tie__field--full">
              <span>脚注内容</span>
              <el-input v-model="fnText" type="textarea" :rows="2" />
            </label>
          </div>

          <div class="tie__actions">
            <el-button size="small" @click="close">取消</el-button>
            <el-button type="primary" size="small" :loading="submitting" @click="submitFootnote">提交脚注操作</el-button>
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

.tie__field--full {
  grid-column: 1 / -1;
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
