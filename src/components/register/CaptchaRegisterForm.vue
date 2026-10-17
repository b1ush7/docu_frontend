<script setup lang="ts">
/**
 * @file CaptchaRegisterForm.vue
 * @description 验证码注册表单（手写，无 UI 库）：用户名 + 手机号（必填）+ 验证码 + 密码
 *              + 注册按钮，五行纵向排列，行间距 22px（与密码注册表单一致）。
 *
 *              与密码注册的差别：手机号为**必填**（P2 验证码注册要求手机号必填），
 *              并多出「验证码」一行（复用 CaptchaInput：含 60s 倒计时发送按钮）。
 *
 *              视觉：
 *                · 用户名 / 手机号框与 PasswordInput 同一墨线规格：305×37、
 *                  1px $line 边框、4px 圆角、透明底、宋体 14px；聚焦边框转 $ink；
 *                · 验证码行复用 CaptchaInput；密码行复用 PasswordInput（autocomplete=new-password）；
 *                · 提交复用 LoginButton（「注 册」/「注册中…」）。
 *
 *              错误提示（沿用内联模式）：
 *                · 用户名格式、手机号格式、验证码位数、密码长度四类错误，
 *                  显示在对应字段【正下方间隙内】（12px 墨色宋体，不用红色）；
 *                · 发送验证码失败（CaptchaInput emit('error')）落在手机号框下方。
 *
 *              行为：
 *                · 各字段受控；提交时本地校验：
 *                  - 用户名非空且符合 /^[A-Za-z0-9_]{4,20}$/；
 *                  - 手机号符合 /^1[3-9]\d{9}$/（必填）；
 *                  - 验证码为 4-8 位数字；
 *                  - 密码非空且 8-64 位；
 *                · 发送验证码 → 调用父级注入的 requestCode(phone)（→ POST /user/register/code）；
 *                · 注册提交 → emit('submit', { username, phone, code, password })，由父级接入 api；
 *                · loading=true 时禁用全部输入与按钮。
 *
 *              定位：根节点为 305 宽的纵向流式块，顶部由父级画布定位。
 */
import { ref } from 'vue'

import CaptchaInput from '@/components/login/CaptchaInput.vue'
import PasswordInput from '@/components/login/PasswordInput.vue'
import LoginButton from '@/components/login/LoginButton.vue'
import {
  isValidCaptchaCode,
  isValidPhone,
  isValidRegisterPassword,
  isValidUsername,
  CODE_ERROR_MESSAGE,
  PASSWORD_LENGTH_ERROR_MESSAGE,
  PASSWORD_REQUIRED_MESSAGE,
  PHONE_ERROR_MESSAGE,
  USERNAME_ERROR_MESSAGE,
  USERNAME_REQUIRED_MESSAGE,
} from '@/utils/validate'

interface Props {
  /** 注册请求进行中：禁用所有输入与按钮 */
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
  /** 提交表单（已通过本地校验） */
  (e: 'submit', payload: {
    username: string
    phone: string
    code: string
    password: string
  }): void
  /** 校验失败：message 供父级做页面内联提示 */
  (e: 'error', message: string): void
  /** 验证码发送成功 */
  (e: 'sent'): void
}>()

/// 用户名
const username = ref('')
/// 手机号（必填）
const phone = ref('')
/// 验证码
const code = ref('')
/// 密码
const password = ref('')

/** 出错字段标识：决定错误文案显示在哪个输入框下方 */
type ErrorField = 'username' | 'phone' | 'code' | 'password'
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

/** 清除当前字段错误提示 */
function clearError(field: ErrorField): void {
  if (errorField.value === field) {
    errorField.value = null
    errorMessage.value = ''
  }
}

/** 用户名输入：同步值并清除用户名错误提示 */
function onUsernameInput(event: Event): void {
  const target = event.target as HTMLInputElement
  username.value = target.value
  clearError('username')
}

/** 手机号输入：过滤非数字、截断 11 位，并清除手机号错误提示 */
function onPhoneInput(event: Event): void {
  const target = event.target as HTMLInputElement
  phone.value = target.value.replace(/\D/g, '').slice(0, 11)
  clearError('phone')
}

/** 验证码输入（CaptchaInput 的 v-model 更新）：同步值并清除验证码错误提示 */
function onCodeUpdate(value: string): void {
  code.value = value
  clearError('code')
}

/** 密码输入（PasswordInput 的 v-model 更新）：同步值并清除密码错误提示 */
function onPasswordUpdate(value: string): void {
  password.value = value
  clearError('password')
}

/** CaptchaInput 发送前的手机号校验失败 / 请求失败：错误落在手机号框下方 */
function onCaptchaError(message: string): void {
  showError('phone', message)
}

/** 验证码发送成功：清除手机号框下方错误并通知父级 */
function onCaptchaSent(): void {
  clearError('phone')
  emit('sent')
}

/**
 * 表单提交：本地校验通过后 emit('submit')，否则在字段下方内联提示
 */
function handleSubmit(): void {
  const usernameValue = username.value.trim()
  if (!usernameValue) {
    showError('username', USERNAME_REQUIRED_MESSAGE)
    return
  }
  if (!isValidUsername(usernameValue)) {
    showError('username', USERNAME_ERROR_MESSAGE)
    return
  }

  const phoneValue = phone.value.trim()
  if (!isValidPhone(phoneValue)) {
    showError('phone', PHONE_ERROR_MESSAGE)
    return
  }

  if (!isValidCaptchaCode(code.value)) {
    showError('code', CODE_ERROR_MESSAGE)
    return
  }

  if (!password.value) {
    showError('password', PASSWORD_REQUIRED_MESSAGE)
    return
  }
  if (!isValidRegisterPassword(password.value)) {
    showError('password', PASSWORD_LENGTH_ERROR_MESSAGE)
    return
  }

  emit('submit', {
    username: usernameValue,
    phone: phoneValue,
    code: code.value,
    password: password.value,
  })
}
</script>

<template>
  <form class="captcha-register-form" @submit.prevent="handleSubmit">
    <!-- 用户名行：输入框 + 下方内联错误 -->
    <div class="captcha-register-form__row">
      <input
        :value="username"
        class="captcha-register-form__field"
        type="text"
        placeholder="请输入用户名"
        autocomplete="username"
        :disabled="loading"
        spellcheck="false"
        @input="onUsernameInput"
      />
      <span
        v-if="errorField === 'username'"
        class="captcha-register-form__error"
        role="alert"
      >{{ errorMessage }}</span>
    </div>

    <!-- 手机号行（必填）：输入框 + 下方内联错误 -->
    <div class="captcha-register-form__row">
      <input
        :value="phone"
        class="captcha-register-form__field"
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
        class="captcha-register-form__error"
        role="alert"
      >{{ errorMessage }}</span>
    </div>

    <!-- 验证码行：验证码框（含 60s 倒计时发送按钮）+ 下方内联错误 -->
    <div class="captcha-register-form__row">
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
        class="captcha-register-form__error"
        role="alert"
      >{{ errorMessage }}</span>
    </div>

    <!-- 密码行：密码框（含显隐切换）+ 下方内联错误 -->
    <div class="captcha-register-form__row">
      <PasswordInput
        :model-value="password"
        placeholder="设置密码（8-64 位）"
        autocomplete="new-password"
        :disabled="loading"
        @update:model-value="onPasswordUpdate"
      />
      <span
        v-if="errorField === 'password'"
        class="captcha-register-form__error"
        role="alert"
      >{{ errorMessage }}</span>
    </div>

    <!-- 注册按钮：type=submit，点击与回车统一走 form 的 submit -->
    <LoginButton
      label="注 册"
      loading-label="注册中…"
      :loading="loading"
    />
  </form>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// 根节点：305 宽纵向流式块；五行间距 22px
.captcha-register-form {
  display: flex;
  flex-direction: column;
  width: 305px;
  gap: 22px;

  // 字段行：305×37，为下方绝对定位的错误提示提供定位上下文，自身不随提示变高
  &__row {
    position: relative;
    flex: none;
    width: 305px;
    height: 37px;
  }

  // 文本输入框：与 PasswordInput 同一墨线视觉规格
  &__field {
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

  // 内联错误：位于字段正下方 4px，落在 22px 间隙内；
  // 12px 墨色宋体，不使用红色，保持纸面墨线气质；出现时不撑动布局
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
    animation: captcha-register-form-fade-in $transition-fast ease;
  }
}

// 错误文案轻微淡入
@keyframes captcha-register-form-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

// 用户偏好减少动效时关闭淡入
@media (prefers-reduced-motion: reduce) {
  .captcha-register-form__error {
    animation: none;
  }
}
</style>
