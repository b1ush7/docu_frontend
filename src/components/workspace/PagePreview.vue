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

/** 总页数（pageCount 可能为 null） */
const totalPages = computed(() => meta.value?.pageCount ?? 0)

/** 是否可翻页 */
const canPrev = computed(() => pageNo.value > 1)
const canNext = computed(() => pageNo.value < totalPages.value)

/** 释放上一张图片的对象 URL，避免内存泄漏 */
function revokeImage(): void {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
  }
}

/** 加载某页图片 */
async function loadPage(target: number): Promise<void> {
  pageLoading.value = true
  error.value = ''
  try {
    const blob = await previewApi.getPageImage(props.fileId, props.versionNo, target)
    revokeImage()
    imageUrl.value = URL.createObjectURL(blob)
    pageNo.value = target
  } catch (e) {
    // 503 通常表示服务端未接入渲染后端；422 表示这一页本身无法渲染
    error.value = e instanceof ApiError ? e.message : '页面渲染失败'
  } finally {
    pageLoading.value = false
  }
}

/** 加载元信息，成功后自动渲染第一页 */
async function loadMeta(): Promise<void> {
  loading.value = true
  error.value = ''
  meta.value = null
  revokeImage()
  try {
    const info = await previewApi.getMeta(props.fileId, props.versionNo)
    meta.value = info
    if (info.previewable && (info.pageCount ?? 0) > 0) {
      await loadPage(1)
    }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '预览信息加载失败'
  } finally {
    loading.value = false
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
          第 {{ pageNo }} / {{ totalPages }} 页 · {{ meta.dpi }} DPI · {{ meta.engine || 'native' }}
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
