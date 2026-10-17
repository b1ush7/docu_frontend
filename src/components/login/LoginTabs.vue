<script setup lang="ts">
/**
 * @file LoginTabs.vue
 * @description 认证方式切换组件（手写 Tab）：默认渲染登录页的「密码登录」/「验证码登录」，
 *              注册页通过 tabs 属性传入「密码注册」/「验证码注册」，两页共用同一套几何。
 *
 *              本组件运行在认证表单的【设计稿画布坐标系】内（画布宽 305，由页面组件
 *              统一等比缩放），根节点固定 305×45，绝对定位于画布 y=227 处。
 *
 *              设计稿实测坐标（画布坐标，两个 Tab 文案均为 4/5 字，登录与注册同名同宽）：
 *                · 左项文本框   x=0，   宽 88（4 字 ≈ 80px）
 *                · 右项文本框   x=205， 宽 100（5 字）
 *                · 激活态下划线 左项：left=0、宽 81；右项：left=205、宽 100
 *                · 下划线         top=259（槽内 32px）、高约 1.5px
 *                · 字号 20、字重 400
 *
 *              交互（v-model 受控）：
 *                · 点击切换当前方式；激活文字为墨色 $ink，非激活为次级 $ink-soft；
 *                · 下划线在两个 Tab 间滑动过渡（left / width 过渡 0.2s）；
 *                · 按钮具备键盘可达性（原生 button + aria-selected）。
 */

import { computed } from 'vue'

/** 认证方式：密码 / 验证码 */
type AuthMode = 'password' | 'code'

/**
 * 单个 Tab 的布局描述
 * @property key      方式标识
 * @property label    文案
 * @property left     距画布左侧距离（设计稿像素）
 * @property width    文本框宽度（设计稿像素）
 * @property barWidth 激活下划线宽度（设计稿像素）
 */
interface TabItem {
  key: AuthMode
  label: string
  left: number
  width: number
  barWidth: number
}

/** 登录页默认两项（保持原有几何与文案不变） */
const LOGIN_TABS: TabItem[] = [
  { key: 'password', label: '密码登录', left: 0, width: 88, barWidth: 81 },
  { key: 'code', label: '验证码登录', left: 205, width: 100, barWidth: 100 },
]

interface Props {
  /** 当前激活的方式（受控，配合 v-model） */
  modelValue: AuthMode
  /** Tab 配置；不传则使用登录页默认两项 */
  tabs?: TabItem[]
  /** 无障碍分组标签（登录页「登录方式」/ 注册页「注册方式」） */
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  tabs: undefined,
  ariaLabel: '登录方式',
})

const emit = defineEmits<{
  /** 方式变化事件，用于 v-model:model-value */
  (e: 'update:modelValue', value: AuthMode): void
}>()

/// Tab 字号（设计稿 20px）
const TAB_FONT_SIZE = 20

/// 下划线距槽顶距离（设计稿 y=259 − 槽顶 y=227 = 32）
const INDICATOR_TOP = 32
/// 下划线高度（设计稿实测约 1.5px）
const INDICATOR_HEIGHT = 1.5

/** 实际渲染的 Tab 列表：未传 tabs 时回退到登录页两项 */
const tabList = computed<TabItem[]>(() => props.tabs ?? LOGIN_TABS)

/** 点击 Tab：仅在切换到另一项时发出更新事件 */
function selectTab(key: AuthMode): void {
  if (props.modelValue !== key) {
    emit('update:modelValue', key)
  }
}

/** 当前激活项的布局描述（供下划线读取 left / barWidth，避免模板重复查找） */
const activeTab = computed<TabItem>(
  () => tabList.value.find((t) => t.key === props.modelValue) ?? tabList.value[0],
)
</script>

<template>
  <div class="login-tabs" role="tablist" :aria-label="props.ariaLabel">
    <button
      v-for="tab in tabList"
      :key="tab.key"
      type="button"
      role="tab"
      class="login-tabs__item"
      :class="{ 'login-tabs__item--active': props.modelValue === tab.key }"
      :style="{
        left: `${tab.left}px`,
        width: `${tab.width}px`,
        fontSize: `${TAB_FONT_SIZE}px`,
      }"
      :aria-selected="props.modelValue === tab.key"
      @click="selectTab(tab.key)"
    >
      {{ tab.label }}
    </button>

    <!-- 激活态下划线：left / width 随激活项滑动过渡 -->
    <span
      class="login-tabs__indicator"
      :style="{
        left: `${activeTab.left}px`,
        width: `${activeTab.barWidth}px`,
        top: `${INDICATOR_TOP}px`,
        height: `${INDICATOR_HEIGHT}px`,
      }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// 根节点：305×45，绝对定位于表单画布 y=227 处
.login-tabs {
  position: absolute;
  top: 227px;
  left: 0;
  width: 305px;
  height: 45px;

  // 单个 Tab：手写按钮，去掉默认样式，文字左对齐
  &__item {
    position: absolute;
    top: 0;
    height: 32px;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    font-family: $font-serif;
    font-weight: $weight-normal;
    line-height: 32px;
    text-align: left;
    color: $ink-soft;
    cursor: pointer;
    // 文字颜色随激活态轻微过渡
    transition: color $transition-fast;

    // 激活态：墨色
    &--active {
      color: $ink;
    }

    // 键盘聚焦：仅用极细墨色下描边提示，不破坏克制风格
    &:focus-visible {
      outline: none;
      border-bottom: 1px solid $ink;
    }
  }

  // 激活下划线：墨色实线，left/width 滑动过渡实现轻微切换动效
  &__indicator {
    position: absolute;
    background: $ink;
    transition:
      left $transition-fast,
      width $transition-fast;
  }
}
</style>
