<script setup lang="ts">
/**
 * @component SidebarSearch
 * @description 侧边栏顶部全局搜索框：对下方"文件列表 / 任务列表"同时生效。
 *              组件内部持有输入草稿，输入停顿（防抖）后向父组件抛出 search 事件，
 *              父组件将关键字分发给文件列表（服务端 keyword 过滤）与任务列表（本地过滤）。
 */
import { onBeforeUnmount, ref, watch } from 'vue'

/** 组件对外事件 */
const emit = defineEmits<{
  /** 防抖后的搜索关键字变化：空串表示清空搜索 */
  (e: 'search', keyword: string): void
}>()

/** 搜索输入草稿（组件内持有，防抖后对外抛出） */
const keyword = ref('')

/** 防抖定时器句柄：连续输入只在停顿后发起一次搜索 */
let timer: ReturnType<typeof setTimeout> | null = null

/** 防抖等待毫秒数：过短请求密集、过长体感迟钝，300ms 为常用折中 */
const DEBOUNCE_MS = 300

// 输入变化 → 防抖后抛出当前关键字
watch(keyword, () => {
  if (timer) {
    clearTimeout(timer)
  }
  timer = setTimeout(() => {
    emit('search', keyword.value.trim())
  }, DEBOUNCE_MS)
})

/**
 * 清空搜索：置空输入并立即抛出空关键字（不走防抖，反馈更直接）
 */
function clearKeyword(): void {
  if (timer) {
    clearTimeout(timer)
  }
  keyword.value = ''
  emit('search', '')
}

// 组件卸载时清理定时器，防止对已卸载组件的回调触发
onBeforeUnmount(() => {
  if (timer) {
    clearTimeout(timer)
  }
})
</script>

<template>
  <div class="sidebar-search">
    <svg
      class="sidebar-search__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
    <input
      v-model="keyword"
      class="sidebar-search__input"
      type="text"
      placeholder="搜索文件与任务"
    />
    <button
      v-if="keyword"
      class="sidebar-search__clear"
      type="button"
      aria-label="清空搜索"
      @click="clearKeyword"
    >
      ×
    </button>
  </div>
</template>

<style scoped lang="scss">
.sidebar-search {
  position: relative;
  display: flex;
  align-items: center;
}

.sidebar-search__icon {
  // 搜索图标绝对定位于输入框左侧
  position: absolute;
  left: $input-padding-x;
  width: 14px; // 顶栏图标结构尺寸
  height: 14px;
  color: $ink-soft;
  pointer-events: none;
}

.sidebar-search__input {
  width: 100%;
  height: $control-height;
  // 左侧留出图标空间（图标宽 + 与文字的间距），右侧留出清空按钮空间
  padding: 0 calc(#{$input-padding-x} * 2 + 14px) 0 calc(#{$input-padding-x} * 2 + 4px);
  font: inherit;
  font-size: $font-size-caption;
  color: $ink;
  background-color: $paper-base;
  border: $border-w solid $line;
  border-radius: $radius;
  transition: border-color $transition-fast;

  &::placeholder {
    color: $ink-soft;
  }

  &:focus-visible {
    outline: none;
    border-color: $ink-soft;
  }
}

.sidebar-search__clear {
  // 清空按钮覆盖于输入框右侧
  position: absolute;
  right: $gap-xs;
  display: flex;
  align-items: center;
  justify-content: center;
  // 按钮结构尺寸：略小于输入框高度的方形点击区
  width: 18px;
  height: 18px;
  padding: 0;
  font: inherit;
  font-size: $font-size-body;
  line-height: 1;
  color: $ink-soft;
  background: none;
  border: none;
  cursor: pointer;
  transition: color $transition-fast;

  &:hover {
    color: $ink;
  }
}
</style>
