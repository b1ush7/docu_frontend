<script setup lang="ts">
/**
 * @component PagePreview
 * @description 按页渲染指定版本的真实版面（后端用 LibreOffice 等渲染成 PNG）。
 *
 * 与 PreviewPanel 的「结构预览」互补：
 *   - 结构预览：读 JSON 块结构自己拼 HTML，快但字体/页边距/分页不精确；
 *   - 版面预览：拿后端渲染的 PNG，所见即所得，但依赖服务端渲染能力。
 *
 * 三种状态都要处理清楚：
 *   - previewable=false：服务端不支持（如未装渲染后端）→ 显示 message，不报错；
 *   - 页面图片接口 503：服务端没配好 → 显示可读提示；
 *   - pageCount=null：首次渲染前页数未知，按 0 处理并提示。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { previewApi } from '@/api/preview'
import { ApiError } from '@/api/http'
import type { VersionPreviewMeta } from '@/api/types'

const props = defineProps<{
  /** 文件 ID */
  fileId: number
  /** 明确版本号（不要传「最新版本」） */
  versionNo: number
}>()

/** 预览元信息 */
const meta = ref<VersionPreviewMeta | null>(null)
/** 元信息加载中 */
const loading = ref(false)
/** 加载失败提示 */
const error = ref('')
/** 当前页页码（从 1 开始） */
const pageNo = ref(1)
/** 当前页图片的对象 URL */
const imageUrl = ref('')
/** 页面图片加载中 */
const pageLoading = ref(false)
let generation = 0
let pageRequest = 0

/** 总页数（pageCount 可能为 null） */
const totalPages = computed(() => meta.value?.pageCount ?? (imageUrl.value ? 1 : 0))

/**
 * 已知总页数；null 表示「还不知道」。
 *
 * 来源优先级：
 *   1. 元信息接口的 pageCount（PDF / 图片一定有；DOCX 恒为 null）
 *   2. 页面图片响应头 `X-Total-Pages`（后端渲染 DOCX 时把 manifest.pageCount 带回来了）
 *   3. 越界错误的文案「（该版本共 N 页）」——仅在旧版后端或响应头缺失时兜底
 */
const learnedPages = ref<number | null>(null)

/** 确定的总页数；null = 尚未确定 */
const knownPages = computed(() => meta.value?.pageCount ?? learnedPages.value ?? null)

/** 是否可翻页 */
const canPrev = computed(() => pageNo.value > 1)
// 页数未知时允许尝试翻页：由后端越界错误来划定边界，否则 DOCX 永远停在第 1 页
const canNext = computed(() =>
  knownPages.value === null ? true : pageNo.value < knownPages.value,
)

/** 释放上一张图片的对象 URL，避免内存泄漏 */
function revokeImage(): void {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
  }
}

/** 加载某页图片 */
async function loadPage(target: number): Promise<void> {
  const revision = generation
  const request = ++pageRequest
  const fileId = props.fileId
  const versionNo = props.versionNo
  pageLoading.value = true
  error.value = ''
  try {
    const { blob, totalPages } = await previewApi.getPageImage(fileId, versionNo, target)
    if (revision !== generation || request !== pageRequest) return
    revokeImage()
    imageUrl.value = URL.createObjectURL(blob)
    pageNo.value = target
    // 后端在 X-Total-Pages 头里给出了总页数：直接采用，无需再探测
    if (totalPages !== null) learnedPages.value = totalPages
    if (meta.value?.pageCount == null) {
      const refreshed = await previewApi.getMeta(fileId, versionNo)
      if (revision === generation && request === pageRequest) meta.value = refreshed
    }
  } catch (e) {
    // 503 表示服务端未接入渲染后端；越界返回 404
    if (revision === generation && request === pageRequest) {
      const message = e instanceof ApiError ? e.message : '页面渲染失败'
      // 越界时后端会报「第 N 页不存在或无法渲染（该版本共 M 页）」。
      // 这不是失败：记下真实页数即可（按钮随即变为禁用），当前页继续保留在屏幕上。
      const matched = /共\s*(\d+)\s*页/.exec(message)
      if (matched) learnedPages.value = Number(matched[1])
      else error.value = message
    }
  } finally {
    if (revision === generation && request === pageRequest) pageLoading.value = false
  }
}

/** 加载元信息，成功后自动渲染第一页 */
async function loadMeta(): Promise<void> {
  const revision = ++generation
  pageRequest++
  pageNo.value = 1
  pageLoading.value = false
  loading.value = true
  error.value = ''
  meta.value = null
  // 换了文件/版本，之前学到的页数不再适用
  learnedPages.value = null
  revokeImage()
  try {
    const info = await previewApi.getMeta(props.fileId, props.versionNo)
    if (revision !== generation) return
    meta.value = info
    if (info.previewable && (info.pageCount === null || info.pageCount > 0)) {
      await loadPage(1)
    }
  } catch (e) {
    if (revision === generation) error.value = e instanceof ApiError ? e.message : '预览信息加载失败'
  } finally {
    if (revision === generation) loading.value = false
  }
}

/** 上一页 */
function prevPage(): void {
  if (canPrev.value && !pageLoading.value) {
    void loadPage(pageNo.value - 1)
  }
}

/** 下一页 */
function nextPage(): void {
  if (canNext.value && !pageLoading.value) {
    void loadPage(pageNo.value + 1)
  }
}

// 版本变化时重新加载（确认生成产生新版本会触发）
watch(
  () => [props.fileId, props.versionNo],
  () => {
    void loadMeta()
  },
  { immediate: true },
)

// 卸载时释放对象 URL
onBeforeUnmount(() => {
  generation++
  pageRequest++
  revokeImage()
})
</script>

<template>
  <div class="page-preview">
    <!-- 元信息加载中 -->
    <p v-if="loading" class="page-preview__hint">版面信息加载中…</p>

    <!-- 加载失败 -->
    <p v-else-if="error" class="page-preview__hint" role="alert">{{ error }}</p>

    <!-- 服务端不支持预览：这不是错误，显示后端给出的说明即可 -->
    <p v-else-if="meta && !meta.previewable" class="page-preview__hint">
      {{ meta.message || '当前服务端未启用页面渲染，只能使用结构预览。' }}
    </p>

    <!-- 可预览但页数为 0 -->
    <p v-else-if="meta && totalPages === 0" class="page-preview__hint">
      未获取到可渲染的页面。{{ meta.message || '' }}
    </p>

    <!-- 页面渲染 -->
    <template v-else-if="meta">
      <div class="page-preview__sheet">
        <p v-if="pageLoading" class="page-preview__hint">第 {{ pageNo }} 页渲染中…</p>
        <img
          v-else-if="imageUrl"
          class="page-preview__image"
          :src="imageUrl"
          :alt="`第 ${pageNo} 页`"
        />
        <p v-else class="page-preview__hint">暂无页面图像</p>
      </div>

      <!-- 翻页控制 -->
      <div class="page-preview__pager">
        <button
          class="page-preview__pager-btn"
          type="button"
          :disabled="!canPrev || pageLoading"
          @click="prevPage"
        >
          上一页
        </button>
        <span class="page-preview__pager-info">
          第 {{ pageNo }} / {{ knownPages ?? '?' }} 页 · {{ meta.dpi }} DPI · {{ meta.engine || 'native' }}
        </span>
        <button
          class="page-preview__pager-btn"
          type="button"
          :disabled="!canNext || pageLoading"
          @click="nextPage"
        >
          下一页
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.page-preview {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  min-height: 0;
}

.page-preview__hint {
  margin: 0;
  font-size: $font-size-body;
  color: $ink-soft;
}

/* 纸张容器：底色 + 细边框，模拟真实页面 */
.page-preview__sheet {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: auto;
  padding: $gap-sm;
  background-color: $paper-base;
  border: $border-w solid $line;
  border-radius: $radius;
}

.page-preview__image {
  display: block;
  max-width: 100%;
  height: auto;
  background-color: $paper-surface;
}

.page-preview__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $gap-sm;
}

.page-preview__pager-btn {
  min-width: 72px;
  height: $control-height;
  padding: 0 $gap-sm;
  font: inherit;
  font-size: $font-size-caption;
  color: $ink;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
  cursor: pointer;
  transition: border-color $transition-fast, opacity $transition-fast;

  &:hover:not(:disabled) {
    border-color: $ink-soft;
  }

  &:disabled {
    opacity: $disabled-opacity;
    cursor: default;
  }
}

.page-preview__pager-info {
  font-size: $font-size-caption;
  color: $ink-soft;
}
</style>
