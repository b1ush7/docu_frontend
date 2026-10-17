<template>
  <div class="login-page">
    <el-card class="login-card">
      <div class="brand">文枢 · 管理后台</div>
      <div class="subtitle">仅限管理员登录</div>
      <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="submit">
        <el-form-item prop="account">
          <el-input v-model="form.account" placeholder="用户名或手机号" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="密码" :prefix-icon="Lock" />
        </el-form-item>
        <el-button type="primary" class="submit-btn" :loading="loading" @click="submit">登 录</el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const formRef = ref()
const loading = ref(false)
const form = reactive({ account: '', password: '' })
const rules = {
  account: [{ required: true, message: '请输入用户名或手机号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function submit() {
  await formRef.value.validate()
  loading.value = true
  try {
    await auth.login(form.account, form.password)
    router.push(route.query.redirect || '/admin')
  } catch (err) {
    // 登录失败按后端 code/msg 提示：401 账号或密码错误 / 403 账号已被禁用 / 400 账号不能为空
    ElMessage.error(err.message || '登录失败，请稍后重试')
    form.password = ''
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-card {
  width: 400px;
  background: var(--paper-surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.login-card :deep(.el-card__body) {
  padding: 40px 48px;
}
.brand {
  font-size: 22px;
  font-weight: 500;
  text-align: center;
  color: var(--ink);
}
.subtitle {
  text-align: center;
  color: var(--ink-soft);
  font-size: 13px;
  margin: 8px 0 24px;
}
/* 输入框：统一 37px 高、纸面内里、墨色描边 */
.login-card :deep(.el-input__wrapper) {
  min-height: 37px;
  background: var(--paper-surface);
  box-shadow: 0 0 0 1px var(--line) inset;
  border-radius: var(--radius);
  transition: box-shadow 0.2s ease;
}
.login-card :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--ink) inset;
}
.login-card :deep(.el-input__inner) {
  font-size: 14px;
  color: var(--ink);
}
.login-card :deep(.el-input__inner::placeholder) {
  color: var(--ink-soft);
}
/* 登录按钮：墨蓝底、15px、字距 8px 并用 text-indent 抵消保持视觉居中 */
.submit-btn {
  width: 100%;
  height: 37px;
  font-size: 15px;
  letter-spacing: 8px;
  text-indent: 8px;
  background: var(--accent);
  border-color: var(--accent);
  border-radius: var(--radius);
  transition: background 0.2s ease;
}
.submit-btn:hover,
.submit-btn:focus {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.submit-btn.is-loading {
  text-indent: 0;
}
</style>
