<script setup lang="ts">
/**
 * @component LoginView
 * @description 登录页占位组件：仅承接鉴权守卫的跳转目标，避免 404。
 *              登录 / 注册表单为独立开发任务，届时替换本组件内容。
 */
</script>

<template>
  <main class="login-stub">
    <p class="login-stub__text">登录页待实现</p>
  </main>
</template>

<style scoped lang="scss">
.login-stub {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;

  &__text {
    color: $ink-soft;
  }
}
</style>
