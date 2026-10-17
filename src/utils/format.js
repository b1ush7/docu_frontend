import dayjs from 'dayjs'

// 时间：ISO-8601 本地时间无时区后缀，按本地时间解析
export function formatDateTime(v) {
  if (!v) return '-'
  const d = dayjs(v)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : String(v)
}

// 字节数 → KB/MB/GB
export function formatBytes(v) {
  const n = Number(v)
  if (v == null || Number.isNaN(n)) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

// 小数失败率（0.1489）→ "14.89%"
export function formatPercent(v) {
  const n = Number(v)
  if (v == null || Number.isNaN(n)) return '-'
  return `${(n * 100).toFixed(2)}%`
}

// 大数/小数金额按字符串处理，避免精度丢失
export function formatBalance(v) {
  if (v == null || v === '') return '-'
  const n = Number(v)
  return Number.isNaN(n) ? String(v) : n.toFixed(6)
}

// 毫秒 → 可读时长
export function formatDuration(ms) {
  const n = Number(ms)
  if (ms == null || Number.isNaN(n)) return '-'
  if (n < 1000) return `${n}ms`
  if (n < 60_000) return `${(n / 1000).toFixed(1)}s`
  const m = Math.floor(n / 60_000)
  const s = Math.round((n % 60_000) / 1000)
  return `${m}m${s}s`
}

// 长文本截断
export function truncate(v, len = 40) {
  if (v == null || v === '') return '-'
  const s = String(v)
  return s.length > len ? `${s.slice(0, len)}…` : s
}
