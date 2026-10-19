<script setup lang="ts">
/**
 * @component AdminFileInspectDrawer
 * @description 管理员查看任意用户文件的版本、预览与文档结构（API.md 7.7）。
 *
 * 与用户端的区别：
 *   - 路径前缀是 /admin/files/...，归属校验由后端按管理员角色放行；
 *   - 这些接口会写审计日志（如 ADMIN_FILE_VIEW），所以只在显式打开时加载，不做轮询。
 *
 * 结构读取按扩展名分流：DOCX 走 /structure，XLSX 走 /xlsx/structure，
 * 其他格式只提供页面预览（PDF/图片），避免用错接口拿 400/415。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { adminDocsApi } from '@/api/admin-content'
import { ApiError } from '@/api/http'
import { saveBlob } from '@/utils/download'
import { formatBytes, formatDateTime } from '@/utils/format'
import type {
  DocxStructure,
  Version,
  VersionPreviewMeta,
  XlsxStructure,
} from '@/api/types'

const props = defineProps<{
  modelValue: boolean
  fileId: number | null
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()

/** 版本列表 */
const versions = ref<Version[]>([])
/** 当前选中版本号 */
const currentVersionNo = ref<number | null>(null)
/** 预览元信息 */
const meta = ref<VersionPreviewMeta | null>(null)
/** DOCX 结构 */
const docxStructure = ref<DocxStructure | null>(null)
/** XLSX 结构 */
const xlsxStructure = ref<XlsxStructure | null>(null)
/** 当前页图片对象 URL */
const pageUrl = ref('')
/** 当前页页码 */
const pageNo = ref(1)
/** 加载中 */
const loading = ref(false)
/** 错误 */
const error = ref('')
/** 页签：overview / page / structure */
const tab = ref<'overview' | 'page' | 'structure'>('overview')

const current = computed(() => versions.value.find((v) => v.versionNo === currentVersionNo.value) ?? null)

/** 扩展名；结构读取用它分流 */
const extension = computed(() => (current.value?.extension ?? meta.value?.extension ?? '').toLowerCase())

const totalPages = computed(() => meta.value?.pageCount ?? 0)

/** 释放图片对象 URL */
function revokePage(): void {
  if (pageUrl.value) {
    URL.revokeObjectURL(pageUrl.value)
    pageUrl.value = ''
  }
}

/** 加载版本列表并默认选最新 */
async function loadVersions(): Promise<void> {
  if (props.fileId === null) return
  loading.value = true
  error.value = ''
  versions.value = []
  currentVersionNo.value = null
  try {
    const list = await adminDocsApi.listVersions(props.fileId)
    versions.value = list
    currentVersionNo.value = list[0]?.versionNo ?? null
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '版本列表加载失败'
  } finally {
    loading.value = false
  }
}

/** 加载指定版本的元信息、结构与首页图 */
async function loadVersionDetail(versionNo: number): Promise<void> {
  if (props.fileId === null) return
  loading.value = true
  error.value = ''
  meta.value = null
  docxStructure.value = null
  xlsxStructure.value = null
  revokePage()
  pageNo.value = 1
  try {
    const info = await adminDocsApi.getPreviewMeta(props.fileId, versionNo)
    meta.value = info
    const ext = (versions.value.find((v) => v.versionNo === versionNo)?.extension ?? info.extension ?? '').toLowerCase()
    if (ext === 'docx') docxStructure.value = await adminDocsApi.getDocxStructure(props.fileId, versionNo)
    else if (ext === 'xlsx') xlsxStructure.value = await adminDocsApi.getXlsxStructure(props.fileId, versionNo)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '版本详情加载失败'
  } finally {
    loading.value = false
  }
}

/** 渲染指定页（PDF/图片/Office 通用预览接口） */
async function loadPage(target: number): Promise<void> {
  if (props.fileId === null || currentVersionNo.value === null) return
  try {
    const blob = await adminDocsApi.getPageImage(props.fileId, currentVersionNo.value, target)
    revokePage()
    pageUrl.value = URL.createObjectURL(blob)
    pageNo.value = target
  } catch (e) {
    // 503 = 服务端未接入排版后端；422 = 该页无法渲染
    error.value = e instanceof ApiError ? e.message : '页面渲染失败'
  }
}

/** 下载当前版本 */
async function download(): Promise<void> {
  if (props.fileId === null || currentVersionNo.value === null) return
  try {
    const blob = await adminDocsApi.downloadVersion(props.fileId, currentVersionNo.value)
    // Version 记录没有 originalName，用文件 ID + 版本号 + 扩展名拼一个稳定文件名
    const name = `file-${props.fileId}-v${currentVersionNo.value}.${extension.value || 'bin'}`
    saveBlob(blob, name)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '下载失败'
  }
}

// 打开或换文件时重新加载
watch(
  () => [props.modelValue, props.fileId] as const,
  ([visible]) => {
    if (!visible) {
      revokePage()
      return
    }
    tab.value = 'overview'
    void loadVersions()
  },
)

// 切版本时重新加载
watch(currentVersionNo, (no) => {
  if (no !== null && props.modelValue) void loadVersionDetail(no)
})

// 切到「版面」页签且还没有图时，加载第一页
watch(tab, (value) => {
  if (value === 'page' && !pageUrl.value && totalPages.value > 0) void loadPage(1)
})

onBeforeUnmount(revokePage)
</script>

<template>
  <el-drawer
    append-to-body
    :model-value="modelValue"
    title="用户文档查看"
    size="760px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="insp">
      <p v-if="error" class="insp__hint insp__hint--warn" role="alert">{{ error }}</p>

      <el-select
        v-if="versions.length"
        v-model="currentVersionNo"
        class="insp__version"
        placeholder="选择版本"
      >
        <el-option
          v-for="item in versions"
          :key="item.versionNo"
          :label="`v${item.versionNo} · ${item.changeType} · ${formatDateTime(item.createTime)}`"
          :value="item.versionNo"
        />
      </el-select>
      <p v-else-if="!loading" class="insp__hint">该文件没有可查看的版本。</p>

      <template v-if="current">
        <el-tabs v-model="tab" class="insp__tabs">
          <el-tab-pane label="概览" name="overview">
            <dl class="insp__dl">
              <dt>版本</dt><dd>v{{ current.versionNo }}</dd>
              <dt>内容类型</dt><dd>{{ current.contentType }}</dd>
              <dt>扩展名</dt><dd>{{ current.extension }}</dd>
              <dt>大小</dt><dd>{{ formatBytes(current.sizeBytes) }}</dd>
              <dt>变更类型</dt><dd>{{ current.changeType }}</dd>
              <dt>父版本</dt><dd>{{ current.parentVersion !== null ? 'v' + current.parentVersion : '-' }}</dd>
              <dt>说明</dt><dd>{{ current.instruction || current.resultSummary || '-' }}</dd>
              <dt>创建时间</dt><dd>{{ formatDateTime(current.createTime) }}</dd>
              <dt>预览能力</dt>
              <dd>
                {{ meta?.previewable ? '可预览' : '不可预览' }}
                <template v-if="meta?.pageCount !== null && meta?.pageCount !== undefined">
                  · {{ meta.pageCount }} 页
                </template>
                <template v-if="meta?.engine"> · 引擎 {{ meta.engine }}</template>
                <template v-if="meta?.message"> · {{ meta.message }}</template>
              </dd>
            </dl>
            <el-button size="small" @click="download">下载该版本</el-button>
          </el-tab-pane>

          <el-tab-pane label="版面预览" name="page">
            <p v-if="!meta?.previewable" class="insp__hint">
              {{ meta?.message || '当前服务端未启用页面渲染。' }}
            </p>
            <template v-else>
              <div class="insp__sheet">
                <img v-if="pageUrl" :src="pageUrl" class="insp__img" :alt="`第 ${pageNo} 页`" />
                <p v-else class="insp__hint">页面渲染中…</p>
              </div>
              <div class="insp__pager">
                <el-button size="small" :disabled="pageNo <= 1" @click="loadPage(pageNo - 1)">上一页</el-button>
                <span class="insp__hint">第 {{ pageNo }} / {{ totalPages }} 页</span>
                <el-button size="small" :disabled="pageNo >= totalPages" @click="loadPage(pageNo + 1)">下一页</el-button>
              </div>
            </template>
          </el-tab-pane>

          <el-tab-pane label="文档结构" name="structure">
            <!-- DOCX 结构 -->
            <template v-if="docxStructure">
              <p class="insp__hint">共 {{ docxStructure.blocks.length }} 个顶层块</p>
              <ul class="insp__blocks">
                <li v-for="block in docxStructure.blocks" :key="block.blockId">
                  <span class="insp__tag">{{ block.type }}</span>
                  <span class="insp__block-text">{{ block.text || '（无文本）' }}</span>
                </li>
              </ul>
            </template>
            <!-- XLSX 结构 -->
            <template v-else-if="xlsxStructure">
              <p class="insp__hint">
                共 {{ xlsxStructure.totalSheets }} 个工作表，{{ xlsxStructure.includedCells }} 个单元格
                <template v-if="xlsxStructure.truncated">（结果被截断）</template>
              </p>
              <el-collapse>
                <el-collapse-item
                  v-for="sheet in xlsxStructure.sheets"
                  :key="sheet.name"
                  :title="`${sheet.name}（${sheet.cells.length} 个单元格）`"
                >
                  <el-table :data="sheet.cells" size="small" border max-height="320">
                    <el-table-column prop="address" label="单元格" width="90" />
                    <el-table-column prop="type" label="类型" width="90" />
                    <el-table-column prop="value" label="值" min-width="140" show-overflow-tooltip />
                    <el-table-column prop="formula" label="公式" min-width="140" show-overflow-tooltip />
                  </el-table>
                </el-collapse-item>
              </el-collapse>
            </template>
            <p v-else class="insp__hint">
              该格式（{{ extension || '未知' }}）没有结构读取接口，请用「版面预览」。
            </p>
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped lang="scss">
.insp {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  height: 100%;
}

.insp__hint {
  margin: 0;
  font-size: $font-size-body;
  color: $ink-soft;
}

.insp__hint--warn {
  color: $ink;
  font-weight: $weight-medium;
}

.insp__version {
  width: 100%;
}

.insp__tabs {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.insp__dl {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: $gap-xs $gap-sm;
  margin: 0 0 $gap-sm;
  font-size: $font-size-body;

  dt {
    color: $ink-soft;
  }

  dd {
    margin: 0;
    color: $ink;
    word-break: break-word;
  }
}

.insp__sheet {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 200px;
  padding: $gap-sm;
  background-color: $paper-base;
  border: $border-w solid $line;
  border-radius: $radius;
}

.insp__img {
  display: block;
  max-width: 100%;
  height: auto;
  background-color: $paper-surface;
}

.insp__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: $gap-sm;
}

.insp__blocks {
  margin: 0;
  padding-left: $gap-sm;
  font-size: $font-size-body;
  color: $ink;

  li {
    margin-bottom: $gap-xs;
  }
}

.insp__tag {
  margin-right: $gap-xs;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.insp__block-text {
  font-family: $font-serif;
}
</style>
