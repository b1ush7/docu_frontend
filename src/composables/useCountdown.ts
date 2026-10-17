/**
 * @file useCountdown.ts
 * @description 验证码倒计时逻辑的组合式函数，与视图解耦，可在任意组件复用。
 *
 *              对外暴露：
 *                · countdown   当前剩余秒数（0 表示未在倒计时）
 *                · isCounting  是否倒计时中（countdown > 0）
 *                · start()     从指定时长开始倒计时（重复调用会先清旧定时器）
 *                · reset()     立即结束倒计时并归零
 *
 *              生命周期：组件卸载时自动清理 setInterval，避免内存泄漏与
 *              卸载后改状态的告警。定时器 id 使用 number 类型（浏览器环境）。
 */
import { computed, onUnmounted, ref } from 'vue'

/** 验证码倒计时总秒数（需求约定 60 秒） */
export const DEFAULT_COUNTDOWN_SECONDS = 60

/**
 * 创建一个倒计时会话
 * @param duration 倒计时总秒数，默认 60；测试或特殊场景可注入其它值
 * @returns countdown / isCounting / start / reset
 */
export function useCountdown(duration: number = DEFAULT_COUNTDOWN_SECONDS) {
  /// 当前剩余秒数；0 = 空闲，可重新获取
  const countdown = ref(0)
  /// 定时器 id；null 表示当前没有运行中的定时器
  let timerId: number | null = null

  /// 是否倒计时中（供按钮禁用态使用）
  const isCounting = computed(() => countdown.value > 0)

  /** 清理定时器（不改变 countdown，内部使用） */
  function clearTimer(): void {
    if (timerId !== null) {
      window.clearInterval(timerId)
      timerId = null
    }
  }

  /**
   * 立即结束倒计时并归零（组件卸载或需要手动重置时调用）
   */
  function reset(): void {
    clearTimer()
    countdown.value = 0
  }

  /**
   * 从 duration 开始每秒递减；到 0 时自动停表。
   * 边界：重复调用先 reset，避免叠加多个定时器。
   */
  function start(): void {
    reset()
    countdown.value = duration
    timerId = window.setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0) {
        clearTimer()
      }
    }, 1000)
  }

  // 卸载即清表，防止泄漏
  onUnmounted(clearTimer)

  return {
    countdown,
    isCounting,
    start,
    reset,
  }
}
