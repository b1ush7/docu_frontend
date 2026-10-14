<script setup lang="ts">
/**
 * @file CaptchaInput.vue
 * @description 验证码输入组件（手写，无 UI 库）：左侧 6 位验证码输入框 +
 *              右侧「获取验证码 / 重新获取(60s)」倒计时按钮，共处一个
 *              305×37 墨线边框容器内，聚焦验证码输入框时整框边框转墨色
 *              （点击右侧按钮不会让边框保持墨色）。
 *
 *              行为：
 *                1. 点击按钮先用 /^1[3-9]\d{9}$/ 校验父组件传入的 phone；
 *                   不合法 → emit('error')，由父级做【页面内联提示】（不弹窗）；
 *                2. 合法 → 调用父级注入的 requestCode(phone) 异步请求
 *                   （Step 8 接入真实 /user/login/code；本组件不直接依赖 axios，
 *                    保证可独立预览与测试）；
 *                3. 请求成功 → 启动 60s 倒计时，按钮禁用并显示剩余秒数；
 *                   请求失败 → emit('error', 后端 msg)，不启动倒计时；
 *                4. 组件卸载由 useCountdown 自动清理定时器。
 *
 *              定位：根节点为普通 305×37 流式块，坐标由父级容器决定。
 */
import { computed, ref } from 'vue'

import { useCountdown } from '@/composables/useCountdown'
import { isValidPhone, PHONE_ERROR_MESSAGE } from '@/utils/validate'

interface Props {
  /** 验证码输入值（受控，配合 v-model） */
  modelValue: string
  /** 手机号（由手机号输入框所在的父组件传入；点击获取时据此校验/请求） */
  phone: string
  /**
   * 发送验证码请求（由父组件注入，避免本组件直接耦合接口层）
   * @param phone 已通过格式校验的手机号
   * @returns 服务端异步响应；resolve 视为成功，reject(Error) 的 message 作为错误提示
   */
  requestCode: (phone: string) => Promise<unknown>
  /** 整个组件是否禁用（如登录请求进行中） */
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  /** 验证码输入变化 */
  (e: 'update:modelValue', value: string): void
  /** 校验或请求失败：message 用于页面内联错误提示 */
  (e: 'error', message: string): void
  /** 发送成功（父级可据此展示「验证码已发送」提示） */
  (e: 'sent'): void
}>()

/// 倒计时（60s，逻辑来自 useCountdown）
const { countdown, isCounting, start } = useCountdown()

/// 请求进行中标志：控制「发送中…」态并防重复点击
const sending = ref(false)
/// 验证码输入框是否聚焦（只在输入框聚焦时让外框转墨色；
/// 不用 :focus-within，因为点击右侧按钮后按钮残留焦点会让边框一直发墨；
/// 不用 :has()，以兼容较旧的内置浏览器）
const fieldFocused = ref(false)

/** 按钮是否不可点击：组件禁用 / 请求中 / 倒计时中 三者任一 */
const buttonDisabled = computed(
  () => props.disabled || sending.value || isCounting.value,
)

/**
 * 按钮文案（三态）
 * @returns 请求中「发送中…」；倒计时中「重新获取(ns)」；空闲「获取验证码」
 */
const buttonText = computed(() => {
  if (sending.value) {
    return '发送中…'
  }
  if (isCounting.value) {
    return `重新获取(${countdown.value}s)`
  }
  return '获取验证码'
})

/** 输入事件：透传验证码（限制为数字，最多 6 位） */
function onInput(event: Event): void {
  const target = event.target as HTMLInputElement
  // 仅保留数字并截断 6 位，避免写入非数字字符
  emit('update:modelValue', target.value.replace(/\D/g, '').slice(0, 6))
}

/**
 * 点击「获取验证码」：校验手机号 → 请求 → 成功启动倒计时
 * 边界：按钮禁用态直接返回；任何阶段失败都只 emit('error')，不弹窗
 */
async function handleRequest(): Promise<void> {
  if (buttonDisabled.value) {
    return
  }

  // 1. 手机号格式校验（trim 后判定）
  if (!isValidPhone(props.phone.trim())) {
    emit('error', PHONE_ERROR_MESSAGE)
    return
  }

  // 2. 发起请求；失败则透出错误文案，不进入倒计时
  sending.value = true
  try {
    await props.requestCode(props.phone.trim())
    // 3. 成功：开始 60s 倒计时
    start()
    emit('sent')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '验证码发送失败，请稍后重试'
    emit('error', message)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div
    class="captcha-input"
    :class="{
      'captcha-input--disabled': disabled,
      'captcha-input--focus': fieldFocused,
    }"
  >
    <!-- 验证码输入：去边框，融入外框；数字输入，最大 6 位 -->
    <input
      class="captcha-input__field"
      type="text"
      inputmode="numeric"
      maxlength="6"
      autocomplete="one-time-code"
      :value="modelValue"
      :disabled="disabled"
      placeholder="请输入验证码"
      spellcheck="false"
      @input="onInput"
      @focus="fieldFocused = true"
      @blur="fieldFocused = false"
    />

    <!-- 竖分隔线：墨线色，与输入框边框同色 -->
    <span class="captcha-input__divider" aria-hidden="true" />

    <!-- 获取 / 倒计时按钮：纯文字，无底色，禁用态变灰 -->
    <button
      type="button"
      class="captcha-input__button"
      :disabled="buttonDisabled"
      @click="handleRequest"
    >
      {{ buttonText }}
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// 根节点：305×37 墨线框（与 PasswordInput 同一视觉规格）
.captcha-input {
  display: flex;
  align-items: stretch;
  width: 305px;
  height: 37px;
  box-sizing: border-box;
  border: $border-w solid $line;
  border-radius: $radius;
  background: transparent;
  // 边框颜色随输入框聚焦态轻微过渡
  transition: border-color $transition-fast;
  // 仅当【验证码输入框】聚焦时（由 JS 切换 --focus 类）整框边框转墨色
  &--focus {
    border-color: $ink;
  }

  // 整体禁用：降低不透明度
  &--disabled {
    opacity: 0.55;
  }

  // 左侧输入框：无独立边框，占满剩余宽度
  &__field {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0 0 0 12px;
    border: none;
    background: transparent;
    font-family: $font-serif;
    font-weight: $weight-normal;
    font-size: 14px;
    color: $ink;
    outline: none;
    letter-spacing: 2px;

    &::placeholder {
      color: $ink-soft;
      opacity: 1;
      letter-spacing: normal;
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  // 竖分隔线：1px，垂直居中，上下各留 9px 呼吸
  &__divider {
    flex: none;
    align-self: center;
    width: 1px;
    height: 19px;
    background: $line;
  }

  // 右侧按钮：固定宽，透明底，墨色宋体；禁用次级灰
  &__button {
    flex: none;
    width: 102px;
    height: 100%;
    padding: 0 8px;
    border: none;
    background: transparent;
    font-family: $font-serif;
    font-weight: $weight-normal;
    font-size: 13px;
    color: $ink;
    white-space: nowrap;
    cursor: pointer;
    transition: color $transition-fast;

    &:hover:not(:disabled) {
      color: $ink;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    &:disabled {
      color: $ink-soft;
      cursor: not-allowed;
    }

    &:focus-visible {
      outline: none;
      color: $ink;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
}
</style>
