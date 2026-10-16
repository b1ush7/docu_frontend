<script setup lang="ts">
/**
 * @file ChangePasswordForm.vue
 * @description 修改密码表单（手写，无 UI 库）：旧密码 + 新密码 + 修改按钮，
 *              三行纵向排列，行间距 22px（与找回密码表单一致）。
 *
 *              视觉：
 *                · 两行均复用 PasswordInput（305×37 墨线规格，含显隐切换）；
 *                · 提交复用 LoginButton（「修改密码」/「提交中…」，墨底纸字）。
 *
 *              错误提示（沿用内联模式）：
 *                · 旧密码为空、新密码为空、新密码长度不符三类错误，
 *                  显示在对应字段【正下方间隙内】（12px 墨色宋体，不用红色）。
 *
 *              行为（依 API 文档 §2.12）：
 *                · 各字段受控；提交时本地校验：
 *                  - 旧密码必填（非空）；
 *                  - 新密码非空且 8-64 位；
 *                · 提交 → emit('submit', { oldPassword, newPassword })，
 *                  由父级接入 POST /user/change-password；
 *                · loading=true 时禁用全部输入与按钮。
 *
 *              定位：根节点为 305 宽的纵向流式块，顶部由父级画布定位。
 */
import { ref } from 'vue'

import PasswordInput from '@/components/login/PasswordInput.vue'
import LoginButton from '@/components/login/LoginButton.vue'
import {
  isValidRegisterPassword,
  NEW_PASSWORD_REQUIRED_MESSAGE,
  OLD_PASSWORD_REQUIRED_MESSAGE,
  PASSWORD_LENGTH_ERROR_MESSAGE,
} from '@/utils/validate'

interface Props {
  /** 修改请求进行中：禁用所有输入与按钮 */
  loading?: boolean
}

withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  /** 提交表单（已通过本地校验） */
  (e: 'submit', payload: {
    oldPassword: string
    newPassword: string
  }): void
  /** 校验失败：message 供父级做页面内联提示 */
  (e: 'error', message: string): void
}>()

/// 旧密码
const oldPassword = ref('')
/// 新密码
const newPassword = ref('')

/** 出错字段标识：决定错误文案显示在哪个输入框下方 */
type ErrorField = 'oldPassword' | 'newPassword'
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

/** 旧密码输入（PasswordInput 的 v-model 更新）：同步值并清除旧密码错误提示 */
function onOldPasswordUpdate(value: string): void {
  oldPassword.value = value
  clearError('oldPassword')
}

/** 新密码输入（PasswordInput 的 v-model 更新）：同步值并清除新密码错误提示 */
function onNewPasswordUpdate(value: string): void {
  newPassword.value = value
  clearError('newPassword')
}

/**
 * 表单提交：本地校验通过后 emit('submit')，否则在字段下方内联提示
 */
function handleSubmit(): void {
  if (!oldPassword.value) {
    showError('oldPassword', OLD_PASSWORD_REQUIRED_MESSAGE)
    return
  }
  if (!newPassword.value) {
    showError('newPassword', NEW_PASSWORD_REQUIRED_MESSAGE)
    return
  }
  if (!isValidRegisterPassword(newPassword.value)) {
    showError('newPassword', PASSWORD_LENGTH_ERROR_MESSAGE)
    return
  }
  emit('submit', {
    oldPassword: oldPassword.value,
    newPassword: newPassword.value,
  })
}
</script>

<template>
  <form class="change-password-form" @submit.prevent="handleSubmit">
    <!-- 旧密码行：密码框（含显隐切换）+ 下方内联错误 -->
    <div class="change-password-form__row">
      <PasswordInput
        :model-value="oldPassword"
        placeholder="旧密码"
        autocomplete="current-password"
        :disabled="loading"
        @update:model-value="onOldPasswordUpdate"
      />
      <span
        v-if="errorField === 'oldPassword'"
        class="change-password-form__error"
        role="alert"
      >{{ errorMessage }}</span>
    </div>

    <!-- 新密码行：密码框（含显隐切换）+ 下方内联错误 -->
    <div class="change-password-form__row">
      <PasswordInput
        :model-value="newPassword"
        placeholder="设置新密码（8-64 位）"
        autocomplete="new-password"
        :disabled="loading"
        @update:model-value="onNewPasswordUpdate"
      />
      <span
        v-if="errorField === 'newPassword'"
        class="change-password-form__error"
        role="alert"
      >{{ errorMessage }}</span>
    </div>

    <!-- 修改按钮：type=submit，点击与回车统一走 form 的 submit -->
    <LoginButton
      label="修改密码"
      loading-label="提交中…"
      :loading="loading"
    />
  </form>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// 根节点：305 宽纵向流式块；三行间距 22px
.change-password-form {
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
    animation: change-password-form-fade-in $transition-fast ease;
  }
}

// 错误文案轻微淡入
@keyframes change-password-form-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

// 用户偏好减少动效时关闭淡入
@media (prefers-reduced-motion: reduce) {
  .change-password-form__error {
    animation: none;
  }
}
</style>
