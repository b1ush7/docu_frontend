<template>
  <el-container class="admin-layout">
    <el-aside :width="collapsed ? '64px' : '220px'" class="aside">
      <div class="brand" @click="$router.push('/admin')">
        <span v-if="!collapsed">文枢 · 管理后台</span>
        <span v-else>文</span>
      </div>
      <el-menu
        :default-active="$route.path"
        :collapse="collapsed"
        router
        background-color="#1F2A44"
        text-color="#B8B3A6"
        active-text-color="#FBF8F0"
      >
        <el-menu-item index="/admin">
          <el-icon><DataAnalysis /></el-icon>
          <template #title>概览统计</template>
        </el-menu-item>
        <el-menu-item index="/admin/users">
          <el-icon><User /></el-icon>
          <template #title>用户管理</template>
        </el-menu-item>
        <el-menu-item index="/admin/files">
          <el-icon><Folder /></el-icon>
          <template #title>文件管理</template>
        </el-menu-item>
        <el-menu-item index="/admin/tasks">
          <el-icon><List /></el-icon>
          <template #title>任务管理</template>
        </el-menu-item>
        <el-menu-item index="/admin/model-configs">
          <el-icon><Cpu /></el-icon>
          <template #title>模型配置</template>
        </el-menu-item>
        <el-menu-item index="/admin/templates">
          <el-icon><Files /></el-icon>
          <template #title>模板管理</template>
        </el-menu-item>
        <el-menu-item index="/admin/audit-logs">
          <el-icon><Document /></el-icon>
          <template #title>审计日志</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="collapsed = !collapsed">
            <Fold v-if="!collapsed" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/admin' }">概览统计</el-breadcrumb-item>
            <el-breadcrumb-item v-if="$route.path !== '/admin'">{{ $route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown @command="onUserCommand">
            <span class="user-info">
              {{ auth.user?.username || '管理员' }}
              <el-tag size="small" type="danger" effect="plain" style="margin-left: 6px">管理员</el-tag>
              <el-icon style="margin-left: 4px"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="changePwd">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
                <el-dropdown-item command="logoutAll">退出全部其他设备</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>

  <!-- 修改密码：成功后所有会话失效，强制重新登录 -->
  <el-dialog v-model="pwdVisible" title="修改密码" width="420px" :close-on-click-modal="false">
    <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="90px">
      <el-form-item label="原密码" prop="oldPassword">
        <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入原密码" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="8-64 位" />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirmPassword">
        <el-input v-model="pwdForm.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
      </el-form-item>
    </el-form>
    <el-alert type="warning" :closable="false" title="修改成功后所有设备都需重新登录" style="margin-bottom: 8px" />
    <template #footer>
      <el-button @click="pwdVisible = false">取消</el-button>
      <el-button type="primary" :loading="pwdLoading" @click="submitPwd">确认修改</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DataAnalysis, User, Folder, List, Fold, Expand, ArrowDown, Cpu, Document, Files } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { changePassword } from '../api/admin-auth'

const router = useRouter()
const auth = useAuthStore()
const collapsed = ref(false)

const pwdVisible = ref(false)
const pwdLoading = ref(false)
const pwdFormRef = ref()
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, max: 64, message: '新密码长度为 8-64 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_r, v, cb) => (v === pwdForm.newPassword ? cb() : cb(new Error('两次输入的新密码不一致'))),
      trigger: 'blur',
    },
  ],
}

function onUserCommand(cmd) {
  if (cmd === 'changePwd') {
    pwdForm.oldPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
    pwdVisible.value = true
  } else if (cmd === 'logout') {
    ElMessageBox.confirm('确认退出登录？', '退出登录', { type: 'warning' }).then(async () => {
      await auth.logout()
      router.push('/login')
    }).catch(() => {})
  } else if (cmd === 'logoutAll') {
    ElMessageBox.confirm('将退出除当前设备外的所有登录会话，确认继续？', '退出全部其他设备', { type: 'warning' })
      .then(async () => {
        const n = await auth.logoutAll()
        ElMessage.success(`已退出其他 ${n ?? 0} 台设备`)
      })
      .catch(() => {})
  }
}

async function submitPwd() {
  await pwdFormRef.value.validate()
  pwdLoading.value = true
  try {
    // 成功后当前会话立即失效：清 Token 并跳登录页
    await changePassword({ oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword })
    pwdVisible.value = false
    ElMessage.success('密码已修改，请重新登录')
    auth.clearLocal()
    router.push('/login')
  } finally {
    pwdLoading.value = false
  }
}
</script>

<style scoped>
.admin-layout {
  height: 100vh;
}
.aside {
  background: var(--accent);
  transition: width 0.2s ease;
  overflow-x: hidden;
}
.brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--paper-surface);
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 1px solid rgba(251, 248, 240, 0.12);
}
.aside :deep(.el-menu) {
  border-right: none;
}
.aside :deep(.el-menu-item.is-active) {
  background: rgba(251, 248, 240, 0.1);
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  background: var(--paper-surface);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.collapse-btn {
  cursor: pointer;
  font-size: 18px;
  color: var(--ink);
}
.user-info {
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--ink);
}
.main {
  background: transparent;
  overflow-y: auto;
}
</style>
