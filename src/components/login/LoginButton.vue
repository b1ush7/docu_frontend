<script setup lang="ts">
/**
 * @file LoginButton.vue
 * @description 主操作按钮（手写，无 UI 库），默认用于登录，亦供注册表单复用，
 *              文案由 label / loadingLabel 传入。
 *
 *              视觉（与线稿同一墨色系）：
 *                · 尺寸 305×37、4px 圆角；
 *                · 底色墨色 $ink #2B2B2B，文字用纸浆底色 $paper-base #F3EEE3，
 *                  形成「黑底纸字」的版画式对比，与三张线稿纸的黑色描边呼应；
 *                · 默认无阴影；hover 允许极轻 0 2px 6px rgba(0,0,0,.06)；
 *                · 宋体 400、15px、8px 字距（末字用 text-indent 抵消保持居中）。
 *
 *              状态：
 *                · 默认「登 录」；
 *                · loading=true 时文案变「登录中…」并禁用，防重复提交；
 *                · disabled=true（非 loading 的外部禁用，如表单未填）时也禁用，
 *                  但不改变文案；
 *                · 按钮本身不做表单校验，校验由父级表单负责，本组件只负责
 *                  「点击意图」与「加载/禁用」呈现。
 *
 *              定位：根节点为普通 305×37 流式块，坐标由父级容器决定。
 */
import { computed } from 'vue'

interface Props {
  /** 是否处于请求进行中：显示 loadingLabel 并禁用，防止重复提交 */
  loading?: boolean
  /** 外部禁用（如必填项未填）；loading 时本字段无意义 */
  disabled?: boolean
  /** 常态文案（默认「登 录」，注册表单传「注 册」） */
  label?: string
  /** 请求进行中文案（默认「登录中…」） */
  loadingLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  disabled: false,
  label: '登 录',
  loadingLabel: '登录中…',
})

const emit = defineEmits<{
  /** 点击按钮（loading / disabled 状态下不会触发） */
  (e: 'click'): void
}>()

/// 按钮文案：loading 时提示进行中，否则为常态文案
const buttonText = computed(() => (props.loading ? props.loadingLabel : props.label))

/// 实际不可点击：请求进行中或外部禁用
const isDisabled = computed(() => props.loading || props.disabled)

/**
 * 点击处理：禁用态直接吞掉，避免父级收到无效提交。
 * （原生 button 在 disabled 时本就不派发 click，这里再兜底一次。）
 */
function handleClick(): void {
  if (!isDisabled.value) {
    emit('click')
  }
}
</script>

<template>
  <button
    type="submit"
    class="login-button"
    :class="{ 'login-button--loading': loading }"
    :disabled="isDisabled"
    :aria-busy="loading"
    @click="handleClick"
  >
    <!-- loading 时的极简线稿圆环（纯描边旋转），与整体手绘线稿语言一致 -->
    <span v-if="loading" class="login-button__spinner" aria-hidden="true" />
    <span class="login-button__text">{{ buttonText }}</span>
  </button>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// 根节点：305×37 墨底纸字按钮
.login-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 305px;
  height: 37px;
  padding: 0;
  border: none;
  border-radius: $radius;
  background: $ink;
  color: $paper-base;
  font-family: $font-serif;
  font-weight: $weight-normal;
  font-size: 15px;
  letter-spacing: 8px;
  // letter-spacing 会让末字后多出等量空隙，用等宽 text-indent 抵消保持视觉居中；
  // 存在 spinner 时 gap 已重新分配空间，此处缩进仅作用于文字的视觉平衡
  text-indent: 8px;
  cursor: pointer;
  // 默认无阴影；hover / focus 出现极轻投影
  box-shadow: none;
  transition:
    box-shadow $transition-fast,
    opacity $transition-fast;

  // hover：允许的极轻阴影（规范指定 0 2px 6px rgba(0,0,0,.06)）
  &:hover:not(:disabled) {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  }

  // 键盘聚焦：同样用轻阴影提示，不另加突兀描边
  &:focus-visible {
    outline: none;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  }

  // 禁用态统一禁用光标
  &:disabled {
    cursor: not-allowed;
  }

  // 仅【外部禁用】（非 loading）才降低透明度；loading 时按钮同时带 disabled，
  // 若直接用 &:disabled{opacity} 会因特异性高于 &--loading 而把提交中按钮发灰，
  // 故用 :not(--loading) 排除加载态
  &:disabled:not(.login-button--loading) {
    opacity: 0.55;
  }

  // loading 态：保持墨底、无 hover 阴影；此时 spinner 参与 flex 居中，
  // 去掉常态文案的 text-indent 补偿，避免文字被额外右推
  &--loading {
    opacity: 1;
    text-indent: 0;

    &:hover {
      box-shadow: none;
    }
  }

  // loading 圆环：14px 纯描边，纸色，顶部留缺口，匀速旋转
  &__spinner {
    flex: none;
    width: 14px;
    height: 14px;
    border: 1.5px solid rgba(243, 238, 227, 0.35);
    border-top-color: $paper-base;
    border-radius: 50%;
    animation: login-button-spin 0.8s linear infinite;
  }

  // 文案：inline-block 便于与 spinner 对齐
  &__text {
    display: inline-block;
  }
}

// 旋转关键帧
@keyframes login-button-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

// 用户偏好减少动效时，停止 spinner 旋转（无障碍）
@media (prefers-reduced-motion: reduce) {
  .login-button__spinner {
    animation: none;
  }
}
</style>
