<script setup lang="ts">
/**
 * @file PasswordInput.vue
 * @description 手写密码输入框（不依赖任何 UI 组件库）。
 *
 *              视觉：
 *                · 尺寸 305×37（设计稿输入框规格），1px 墨线边框 #D8D2C4、
 *                  4px 圆角，透明底（透出纸浆质感）；
 *                · 聚焦时边框转为墨色 #2B2B2B，无阴影，保持克制；
 *                · 右侧线稿风「眼睛」图标（纯描边 SVG，与 PaperDoc 同一语言），
 *                  点击切换明文 / 密文；睁眼=明文，闭眼（加斜杠）=密文。
 *
 *              定位：本组件【不自我绝对定位】，根节点为普通 305×37 流式块，
 *              由父级表单容器（Step 7 的 PasswordLoginForm 或当前预览槽位）
 *              决定放置位置。
 *
 *              v-model：受控字符串，禁止 any。
 */
import { ref } from 'vue'

interface Props {
  /** 输入值（受控，配合 v-model） */
  modelValue: string
  /** 占位提示文字 */
  placeholder?: string
  /** 是否禁用（如登录请求进行中） */
  disabled?: boolean
  /** 浏览器自动填充语义（登录用 current-password，注册用 new-password） */
  autocomplete?: string
}

withDefaults(defineProps<Props>(), {
  placeholder: '请输入密码',
  disabled: false,
  autocomplete: 'current-password',
})

const emit = defineEmits<{
  /** 输入值变化事件 */
  (e: 'update:modelValue', value: string): void
}>()

/// 是否明文显示；默认密文
const visible = ref(false)

/** 输入事件：把原生 input 的值原样透传给父级 */
function onInput(event: Event): void {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

/** 切换明文 / 密文（禁用态下不响应） */
function toggleVisible(isDisabled: boolean): void {
  if (!isDisabled) {
    visible.value = !visible.value
  }
}

</script>

<template>
  <div class="password-input">
    <input
      class="password-input__field"
      :type="visible ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :autocomplete="autocomplete"
      spellcheck="false"
      @input="onInput"
    />

    <!-- 显隐切换：线稿风眼睛，纯描边。睁眼表示当前明文，闭眼（带斜杠）表示密文 -->
    <button
      type="button"
      class="password-input__toggle"
      :disabled="disabled"
      :aria-label="visible ? '隐藏密码' : '显示密码'"
      :title="visible ? '隐藏密码' : '显示密码'"
      @click="toggleVisible(disabled)"
    >
      <!-- 睁眼：明文 -->
      <svg
        v-if="visible"
        class="password-input__icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <!-- 眼眶（杏仁形，用两条对称弧线构成） -->
        <path
          d="M2.5 12C5.6 7.6 9.1 5.8 12 5.8C14.9 5.8 18.4 7.6 21.5 12C18.4 16.4 14.9 18.2 12 18.2C9.1 18.2 5.6 16.4 2.5 12Z"
        />
        <!-- 瞳孔 -->
        <circle cx="12" cy="12" r="3" />
      </svg>

      <!-- 闭眼：密文（眼眶 + 斜杠） -->
      <svg
        v-else
        class="password-input__icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M2.5 12C5.6 7.6 9.1 5.8 12 5.8C14.9 5.8 18.4 7.6 21.5 12C18.4 16.4 14.9 18.2 12 18.2C9.1 18.2 5.6 16.4 2.5 12Z"
        />
        <circle cx="12" cy="12" r="3" />
        <!-- 斜划：表示不可见 -->
        <line x1="4" y1="4" x2="20" y2="20" />
      </svg>
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// 根节点：305×37 流式块，定位交给父级
.password-input {
  position: relative;
  width: 305px;
  height: 37px;

  // 原生 input：去默认样式，墨线边框，透明底，宋体黑字
  &__field {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 0 44px 0 12px;
    border: $border-w solid $line;
    border-radius: $radius;
    background: transparent;
    font-family: $font-serif;
    font-weight: $weight-normal;
    font-size: 14px;
    color: $ink;
    outline: none;
    // 占位符用次级墨色，靠颜色变浅区分（不用细字重）
    transition: border-color $transition-fast;

    &::placeholder {
      color: $ink-soft;
      opacity: 1;
    }

    // 聚焦：边框转墨色，无阴影
    &:focus {
      border-color: $ink;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
  }

  // 右侧显隐切换按钮：透明底，仅容纳描边图标
  &__toggle {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: $ink-soft;
    cursor: pointer;
    transition: color $transition-fast;

    &:hover:not(:disabled) {
      color: $ink;
    }

    &:disabled {
      cursor: not-allowed;
    }

    &:focus-visible {
      outline: none;
      color: $ink;
    }
  }

  // 眼睛图标：纯描边、圆头线帽，颜色跟随按钮 currentColor
  &__icon {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}
</style>
