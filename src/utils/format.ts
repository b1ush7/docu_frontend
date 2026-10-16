/**
 * @file 展示格式化工具
 * @description 跨组件共用的时间等展示格式化函数，避免各组件重复实现。
 */

/**
 * 格式化后端 ISO-8601 时间：当年显示"MM-DD HH:mm"，跨年显示"YYYY-MM-DD"
 * @param iso 后端时间字符串
 * @returns 展示用时间文本（非法输入原样返回）
 */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  // 非法时间兜底：直接展示原始字符串
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  const pad = (n: number): string => String(n).padStart(2, '0')
  // 当年省略年份，跨年补全年月日
  const sameYear = date.getFullYear() === new Date().getFullYear()
  if (sameYear) {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 格式化耗时毫秒：不足 1 秒显示"Xms"，否则显示一位小数的"X.Xs"，超过 60 秒显示"X分X.Xs"
 * @param ms 耗时毫秒数
 * @returns 展示用耗时文本
 */
export function formatDuration(ms: number): string {
  // 不足 1 秒：直接展示毫秒
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  const seconds = ms / 1000
  // 超过 1 分钟：换算为分 + 秒
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60)
    const restSeconds = (seconds - minutes * 60).toFixed(1)
    return `${minutes}分${restSeconds}s`
  }
  return `${seconds.toFixed(1)}s`
}

/**
 * 格式化字节大小：自动选择 B / KB / MB 单位，保留一位小数
 * @param bytes 字节数
 * @returns 展示用大小文本
 */
export function formatBytes(bytes: number): string {
  // 不足 1KB 直接展示字节
  if (bytes < 1024) {
    return `${bytes}B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
