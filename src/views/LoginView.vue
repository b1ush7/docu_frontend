<script setup lang="ts">
/**
 * @file 登录页
 * @description 视觉骨架（装饰舞台、英文角标、画布缩放、品牌区）由 AuthLayout 统一
 *              提供，本页只保留业务：登录方式 Tab、密码 / 验证码两套表单、提交收口、
 *              服务端错误文案与底部两条跳转链接。
 *
 *              画布内槽位（305 宽设计稿坐标系，BrandTitle 占 y=0~215 由布局固定）：
 *                · 登录方式 Tab                    由 LoginTabs 内部定位（y=227）
 *                · 表单首行（账号 / 手机号）       y=284（FIELD_1_TOP）
 *                  三框（输入框①/②、按钮）高 37、净距 27，由表单组件 flex 排版
 *                · 服务端错误文案                  表单底边下方 8px（SERVER_ERROR_TOP）
 *                · 底部链接行                      y=478（忘记密码？/ 还没有账号？注册）
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import AuthLayout from '@/components/layout/AuthLayout.vue'
import LoginTabs from '@/components/login/LoginTabs.vue'
import PasswordLoginForm from '@/components/login/PasswordLoginForm.vue'
import CaptchaLoginForm from '@/components/login/CaptchaLoginForm.vue'
import { sendLoginCode } from '@/api/auth'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

/** 当前登录方式，由 LoginTabs 切换，据此渲染对应表单 */
type LoginMode = 'password' | 'code'
const loginMode = ref<LoginMode>('password')

/** 表单首行顶边距（设计稿像素），与注册页首行对齐 */
const FIELD_1_TOP = 284
/** 底部链接行顶边距：左「忘记密码？」/ 右「还没有账号？注册」 */
const BOTTOM_LINKS_TOP = 478
/** 服务端错误顶边距：表单底边（284 + 2×(37+27) + 37 = 412）下方 8px */
const SERVER_ERROR_TOP = FIELD_1_TOP + 3 * 37 + 2 * 27 + 8

/** 登录请求进行中标志（密码 / 验证码模式共用） */
const submitting = ref(false)
/** 服务端返回的登录错误文案（显示在表单下方） */
const serverError = ref('')

/**
 * 密码登录提交（PasswordLoginForm 本地校验通过后触发）
 * @description POST /user/login（经 user store 归一化），成功跳转首页；
 *              失败时把服务端 msg 显示在表单下方。
 */
async function handlePasswordSubmit(payload: {
  account: string
  password: string
}): Promise<void> {
  if (submitting.value) {
    return
  }
  submitting.value = true
  serverError.value = ''
  try {
    await userStore.loginWithPassword(payload.account, payload.password)
    await router.push('/')
  } catch (error) {
    serverError.value = error instanceof Error ? error.message : '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

/**
 * 验证码登录提交（CaptchaLoginForm 本地校验通过后触发）
 * @description POST /user/login/by-code（经 user store 归一化），成功跳转首页。
 */
async function handleCaptchaSubmit(payload: {
  phone: string
  code: string
}): Promise<void> {
  if (submitting.value) {
    return
  }
  submitting.value = true
  serverError.value = ''
  try {
    await userStore.loginWithCode(payload.phone, payload.code)
    await router.push('/')
  } catch (error) {
    serverError.value = error instanceof Error ? error.message : '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

/**
 * 发送登录短信验证码（透传给 CaptchaLoginForm → CaptchaInput）
 * @description POST /user/login/code；resolve 触发倒计时，reject(Error) 的
 *              message 由表单显示在手机号框下方。
 * @param phone 已通过格式校验的手机号
 */
async function requestLoginCode(phone: string): Promise<null> {
  await sendLoginCode(phone)
  return null
}
</script>

<template>
  <AuthLayout right-corner-text="Log In">
    <!-- 登录方式切换：密码登录 / 验证码登录 -->
    <LoginTabs v-model="loginMode" />

    <!-- 密码登录表单：账号 + 密码 + 登录按钮 -->
    <div
      v-if="loginMode === 'password'"
      class="auth-page__field auth-page__field--form"
      :style="{ top: `${FIELD_1_TOP}px` }"
    >
      <PasswordLoginForm
        :loading="submitting"
        @submit="handlePasswordSubmit"
      />
    </div>

    <!-- 验证码登录表单：手机号 + 验证码 + 登录按钮 -->
    <div
      v-else
      class="auth-page__field auth-page__field--form"
      :style="{ top: `${FIELD_1_TOP}px` }"
    >
      <CaptchaLoginForm
        :loading="submitting"
        :request-code="requestLoginCode"
        @submit="handleCaptchaSubmit"
      />
    </div>

    <!-- 服务端返回的登录错误（显示在表单下方，不挤压布局） -->
    <span
      v-if="serverError"
      class="auth-page__notice"
      :style="{ top: `${SERVER_ERROR_TOP}px` }"
      role="alert"
    >{{ serverError }}</span>

    <!-- 底部链接行：找回密码 / 前往注册，305 宽内两端对齐 -->
    <div
      class="auth-page__link-row"
      :style="{ top: `${BOTTOM_LINKS_TOP}px` }"
    >
      <RouterLink class="auth-page__link" to="/reset-password">忘记密码？</RouterLink>
      <RouterLink class="auth-page__link" to="/register">还没有账号？注册</RouterLink>
    </div>
  </AuthLayout>
</template>
