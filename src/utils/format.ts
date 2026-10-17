/**
 * @file 展示格式化工具（管理端 + 工作台统一）
 * @description 跨组件共用的时间、大小、百分比等展示格式化函数，避免各组件重复实现。
 */
import dayjs from 'dayjs'

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

/** 时间：ISO-8601 本地时间无时区后缀，按本地时间解析（管理端表格列使用） */
export function formatDateTime(v: unknown): string {
  if (!v) return '-'
  const d = dayjs(String(v))
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : String(v)
}

/**
 * 格式化字节大小：自动选择 B / KB / MB / GB 单位
 * @param bytes 字节数（可空：管理端接口允许 null）
 * @returns 展示用大小文本
 */
export function formatBytes(bytes: number | string | null | undefined): string {
  const n = Number(bytes)
  if (bytes == null || Number.isNaN(n)) return '-'
  // 不足 1KB 直接展示字节
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** 小数失败率（0.1489）→ "14.89%" */
export function formatPercent(v: unknown): string {
  const n = Number(v)
  if (v == null || Number.isNaN(n)) return '-'
  return `${(n * 100).toFixed(2)}%`
}

/** 大数/小数金额按字符串处理，避免精度丢失 */
export function formatBalance(v: unknown): string {
  if (v == null || v === '') return '-'
  const n = Number(v)
  return Number.isNaN(n) ? String(v) : n.toFixed(6)
}

/**
 * 格式化耗时毫秒：不足 1 秒显示"Xms"，否则显示一位小数的"X.Xs"，超过 60 秒显示"X分X.Xs"
 * @param ms 耗时毫秒数（可空）
 * @returns 展示用耗时文本
 */
export function formatDuration(ms: number | null | undefined): string {
  const n = Number(ms)
  if (ms == null || Number.isNaN(n)) return '-'
  // 不足 1 秒：直接展示毫秒
  if (n < 1000) {
    return `${Math.round(n)}ms`
  }
  const seconds = n / 1000
  // 超过 1 分钟：换算为分 + 秒
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60)
    const restSeconds = (seconds - minutes * 60).toFixed(1)
    return `${minutes}分${restSeconds}s`
  }
  return `${seconds.toFixed(1)}s`
}

/** 长文本截断 */
export function truncate(v: unknown, len = 40): string {
  if (v == null || v === '') return '-'
  const s = String(v)
  return s.length > len ? `${s.slice(0, len)}…` : s
}
