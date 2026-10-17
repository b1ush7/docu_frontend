<script setup lang="ts">
/**
 * @file PasswordLoginForm.vue
 * @description 密码登录表单（手写，无 UI 库）：账号输入框 + 密码输入框 + 登录按钮，
 *              三者纵向排列，行间距 27px（与设计稿三框缩半间距一致）。
 *
 *              视觉：
 *                · 账号框与 PasswordInput 同一墨线规格：305×37、1px $line 边框、
 *                  4px 圆角、透明底、宋体 14px；聚焦边框转 $ink；
 *                · 密码框复用 PasswordInput（含显隐切换）；
 *                · 提交复用 LoginButton（墨底纸字）。
 *
 *              错误提示（Step 9）：
 *                · 提交校验失败时，在对应字段【正下方间隙内】显示 12px 墨色宋体
 *                  内联文案（不弹窗、不使用红色等通用 UI 色，保持墨线语言）；
 *                · 提示绝对定位，不挤压三框布局；用户在该字段重新输入后自动清除。
 *
 *              行为：
 *                · 表单内账号、密码均为受控值，提交时做【本地校验】：
 *                  - 账号非空（trim 后）；
 *                  - 密码非空（复用 validate.ts 的 isPasswordValid；长度规则属注册页，不在此处施加）；
 *                  校验不通过时不 emit('submit')。
 *                · 本组件不直接调用接口，提交时 emit('submit', { account, password })，
 *                  由父级 LoginView 接入 store（Step 10）。
 *                · loading=true 时禁用账号框、密码框、按钮，防止提交中修改。
 *
 *              定位：根节点为 305 宽的纵向流式块，顶部由父级画布定位，
 *              内部三框通过 flex + 27px gap 自动排开，等价于设计稿的绝对坐标。
 */
import { ref } from 'vue'

import PasswordInput from '@/components/login/PasswordInput.vue'
import LoginButton from '@/components/login/LoginButton.vue'
import {
  isPasswordValid,
  PASSWORD_REQUIRED_MESSAGE,
} from '@/utils/validate'

interface Props {
  /** 登录请求进行中：禁用所有输入与按钮 */
  loading?: boolean
}

withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  /** 提交表单（已通过本地校验）：账号与密码明文 */
  (e: 'submit', payload: { account: string; password: string }): void
  /** 校验失败：message 供父级做页面内联提示 */
  (e: 'error', message: string): void
}>()

/// 账号（用户名 / 手机号）
const account = ref('')
/// 密码
const password = ref('')

/** 出错字段标识：决定错误文案显示在哪个输入框下方 */
type ErrorField = 'account' | 'password'
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

/** 账号输入：同步值并清除账号错误提示 */
function onAccountInput(event: Event): void {
  const target = event.target as HTMLInputElement
  account.value = target.value
  if (errorField.value === 'account') {
    errorField.value = null
    errorMessage.value = ''
  }
}

/** 密码输入（PasswordInput 的 v-model 更新）：同步值并清除密码错误提示 */
function onPasswordUpdate(value: string): void {
  password.value = value
  if (errorField.value === 'password') {
    errorField.value = null
    errorMessage.value = ''
  }
}

/**
 * 表单提交：本地校验通过后 emit('submit')，否则在字段下方内联提示
 * @description 不使用 HTML5 原生校验弹窗，全部走自定义内联提示流程
 */
function handleSubmit(): void {
  const accountValue = account.value.trim()
  if (!accountValue) {
    showError('account', '请输入账号或手机号')
    return
  }
  if (!isPasswordValid(password.value)) {
    showError('password', PASSWORD_REQUIRED_MESSAGE)
    return
  }
  emit('submit', { account: accountValue, password: password.value })
}
</script>

<template>
  <form class="password-login-form" @submit.prevent="handleSubmit">
    <!-- 账号行：输入框 + 下方内联错误 -->
    <div class="password-login-form__row">
      <input
        :value="account"
        class="password-login-form__account"
        type="text"
        placeholder="账号 / 手机号"
        autocomplete="username"
        :disabled="loading"
        spellcheck="false"
        @input="onAccountInput"
      />
      <span
        v-if="errorField === 'account'"
        class="password-login-form__error"
        role="alert"
      >{{ errorMessage }}</span>
    </div>

    <!-- 密码行：密码框（含显隐切换）+ 下方内联错误 -->
    <div class="password-login-form__row">
      <PasswordInput
        :model-value="password"
        placeholder="请输入密码"
        :disabled="loading"
        @update:model-value="onPasswordUpdate"
      />
      <span
        v-if="errorField === 'password'"
        class="password-login-form__error"
        role="alert"
      >{{ errorMessage }}</span>
    </div>

    <!-- 登录按钮：type=submit，点击与回车统一走 form 的 submit（避免重复触发） -->
    <LoginButton :loading="loading" />
  </form>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// 根节点：305 宽纵向流式块；三框间距 = 设计稿缩半后的 27px
.password-login-form {
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

  // 账号输入框：与 PasswordInput 同一墨线视觉规格
  &__account {
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
    animation: password-login-form-fade-in $transition-fast ease;
  }
}

// 错误文案轻微淡入
@keyframes password-login-form-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

// 用户偏好减少动效时关闭淡入
@media (prefers-reduced-motion: reduce) {
  .password-login-form__error {
    animation: none;
  }
}
</style>
