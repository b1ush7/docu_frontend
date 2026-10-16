<script setup lang="ts">
/**
 * @file 首页（登录成功后的占位页）
 * @description Step 0 占位壳：仅保证路由可达。当前仅放置「修改密码」入口供 P4 联调，
 *              Step 11 联调时统一打磨。
 */
import { useRouter } from 'vue-router'

import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

/** 退出登录：调用后端撤销会话后清空本地凭证，回到登录页 */
async function handleLogout(): Promise<void> {
  await userStore.logout()
  void router.push('/login')
}
</script>

<template>
  <main class="home-page">
    <nav class="home-page__nav">
      <RouterLink class="home-page__nav-link" to="/change-password">修改密码</RouterLink>
      <button class="home-page__nav-link home-page__logout" type="button" @click="handleLogout">
        退出登录
      </button>
    </nav>
  </main>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.home-page {
  min-height: 100vh;

  // 占位导航：右上角一行入口（后续 Step 11 统一打磨替换）
  &__nav {
    position: fixed;
    top: 24px;
    right: 24px;
    display: flex;
    gap: 16px;
    align-items: center;
  }

  &__nav-link {
    font-family: $font-serif;
    font-weight: $weight-normal;
    font-size: 13px;
    color: $ink-soft;
    text-decoration: none;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    transition: color $transition-fast;

    &:hover {
      color: $ink;
      text-decoration: underline;
    }
  }
}
</style>
