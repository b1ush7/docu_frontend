<script setup lang="ts">
/**
 * @file CaptchaLoginForm.vue
 * @description 验证码登录表单（手写，无 UI 库）：手机号输入框 + 验证码输入框 + 登录按钮，
 *              三者纵向排列，行间距 27px（与设计稿三框缩半间距一致）。
 *
 *              视觉：
 *                · 手机号框与 CaptchaInput 同一墨线规格：305×37、1px $line 边框、
 *                  4px 圆角、透明底、宋体 14px；聚焦边框转 $ink；
 *                · 验证码框复用 CaptchaInput（含 60s 倒计时发送按钮）；
 *                · 提交复用 LoginButton（墨底纸字）。
 *
 *              错误提示（Step 9）：
 *                · 手机号格式错误、验证码非 6 位、发送验证码失败三种场景，
 *                  在对应字段【正下方间隙内】显示 12px 墨色宋体内联文案，
 *                  不弹窗、不使用红色等通用 UI 色；
 *                · 提示绝对定位，不挤压三框布局；在出错字段重新输入后自动清除。
 *
 *              行为：
 *                · 手机号、验证码均为受控值；提交时做【本地校验】：
 *                  - 手机号符合 /^1[3-9]\d{9}$/；
 *                  - 验证码为 6 位数字；
 *                  校验不通过时不 emit('submit')。
 *                · 点击「获取验证码」的手机号校验由 CaptchaInput 内部完成，
 *                  失败时 emit('error')，本组件捕获后显示在手机号框下方。
 *                · 本组件不直接调用接口：
 *                  - 发送验证码 → 调用父级注入的 requestCode(phone)（Step 10 接 /user/login/code）；
 *                  - 登录提交 → emit('submit', { phone, code })，由父级接入 store。
 *                · loading=true 时禁用手机号框、验证码框、按钮，防止提交中修改。
 *
 *              定位：根节点为 305 宽的纵向流式块，顶部由父级画布定位，
 *              内部三框通过 flex + 27px gap 自动排开。
 */
import { ref } from 'vue'

import CaptchaInput from '@/components/login/CaptchaInput.vue'
import LoginButton from '@/components/login/LoginButton.vue'
import { isValidPhone, PHONE_ERROR_MESSAGE } from '@/utils/validate'

interface Props {
  /** 登录请求进行中：禁用所有输入与按钮 */
  loading?: boolean
  /**
   * 发送验证码请求（由父组件注入，透传给 CaptchaInput）
   * @param phone 已通过格式校验的手机号
   * @returns 服务端异步响应；resolve 视为成功
   */
  requestCode: (phone: string) => Promise<unknown>
}

withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  /** 提交表单（已通过本地校验）：手机号与验证码 */
  (e: 'submit', payload: { phone: string; code: string }): void
  /** 校验失败：message 供父级做页面内联提示 */
  (e: 'error', message: string): void
  /** 验证码发送成功（父级可据此展示提示） */
  (e: 'sent'): void
}>()

/// 手机号
const phone = ref('')
/// 验证码
const code = ref('')

/** 出错字段标识：决定错误文案显示在哪个输入框下方 */
type ErrorField = 'phone' | 'code'
/// 当前出错字段（null 表示无错误）
const errorField = ref<ErrorField | null>(null)
/// 当前错误文案
const errorMessage = ref('')

/**
 * 设置某字段的内联错误
 * @param field   出错字段
 * @param message 错误文案
 */
function showError(field: ErrorField, message: string): void {
  errorField.value = field
  errorMessage.value = message
  emit('error', message)
}

/** 手机号输入：过滤非数字、截断 11 位，并清除手机号错误提示 */
function onPhoneInput(event: Event): void {
  const target = event.target as HTMLInputElement
  phone.value = target.value.replace(/\D/g, '').slice(0, 11)
  if (errorField.value === 'phone') {
    errorField.value = null
    errorMessage.value = ''
  }
}

/** 验证码输入（CaptchaInput 的 v-model 更新）：同步值并清除验证码错误提示 */
function onCodeUpdate(value: string): void {
  code.value = value
  if (errorField.value === 'code') {
    errorField.value = null
    errorMessage.value = ''
  }
}

/** CaptchaInput 发送验证码前的手机号校验失败 / 请求失败：错误落在手机号框下方 */
function onCaptchaError(message: string): void {
  showError('phone', message)
}

/** 验证码发送成功：清除手机号框下方错误并通知父级 */
function onCaptchaSent(): void {
  if (errorField.value === 'phone') {
    errorField.value = null
    errorMessage.value = ''
  }
  emit('sent')
}

/**
 * 表单提交：本地校验通过后 emit('submit')，否则在字段下方内联提示
 */
function handleSubmit(): void {
  const phoneValue = phone.value.trim()
  if (!isValidPhone(phoneValue)) {
    showError('phone', PHONE_ERROR_MESSAGE)
    return
  }
  if (code.value.length !== 6) {
    showError('code', '请输入 6 位验证码')
    return
  }
  emit('submit', { phone: phoneValue, code: code.value })
}
</script>

<template>
  <form class="captcha-login-form" @submit.prevent="handleSubmit">
    <!-- 手机号行：输入框 + 下方内联错误 -->
    <div class="captcha-login-form__row">
      <input
        :value="phone"
        class="captcha-login-form__phone"
        type="tel"
        inputmode="numeric"
        placeholder="手机号"
        autocomplete="tel"
        :disabled="loading"
        spellcheck="false"
        @input="onPhoneInput"
      />
      <span
        v-if="errorField === 'phone'"
        class="captcha-login-form__error"
        role="alert"
      >{{ errorMessage }}</span>
    </div>

    <!-- 验证码行：验证码框（含 60s 倒计时发送按钮）+ 下方内联错误 -->
    <div class="captcha-login-form__row">
      <CaptchaInput
        :model-value="code"
        :phone="phone"
        :request-code="requestCode"
        :disabled="loading"
        @update:model-value="onCodeUpdate"
        @error="onCaptchaError"
        @sent="onCaptchaSent"
      />
      <span
        v-if="errorField === 'code'"
        class="captcha-login-form__error"
        role="alert"
      >{{ errorMessage }}</span>
    </div>

    <!-- 登录按钮：type=submit，点击与回车统一走 form 的 submit -->
    <LoginButton :loading="loading" />
  </form>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// 根节点：305 宽纵向流式块；三框间距 = 设计稿缩半后的 27px
.captcha-login-form {
  display: flex;
  flex-direction: column;
  width: 305px;
  gap: 27px;

  // 字段行：305×37，为下方绝对定位的错误提示提供定位上下文，自身不随提示变高
  &__row {
    position: relative;
    flex: none;
    width: 305px;
    height: 37px;
  }

  // 手机号输入框：与 CaptchaInput 同一墨线视觉规格
  &__phone {
    box-sizing: border-box;
    width: 305px;
    height: 37px;
    padding: 0 12px;
    border: $border-w solid $line;
    border-radius: $radius;
    background: transparent;
    font-family: $font-serif;
    font-weight: $weight-normal;
    font-size: 14px;
    color: $ink;
    outline: none;
    transition: border-color $transition-fast;

    &::placeholder {
      color: $ink-soft;
      opacity: 1;
    }

    &:focus {
      border-color: $ink;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
  }

  // 内联错误：位于字段正下方 4px，落在 27px 间隙内；
  // 12px 墨色宋体，不使用红色，保持纸面墨线气质；透明度过渡，出现时不撑动布局
  &__error {
    position: absolute;
    top: 41px;
    left: 2px;
    font-family: $font-serif;
    font-weight: $weight-normal;
    font-size: 12px;
    line-height: 1.4;
    color: $ink;
    white-space: nowrap;
    pointer-events: none;
    animation: captcha-login-form-fade-in $transition-fast ease;
  }
}

// 错误文案轻微淡入
@keyframes captcha-login-form-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

// 用户偏好减少动效时关闭淡入
@media (prefers-reduced-motion: reduce) {
  .captcha-login-form__error {
    animation: none;
  }
}
</style>
