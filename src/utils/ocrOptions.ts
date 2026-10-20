import type { OcrParams } from '@/api/types'

/** Build an explicit request; reject malformed ranges rather than silently recognizing all pages. */
export function buildOcrParams(options: OcrParams, pageText: string, image: boolean): OcrParams {
  const value: OcrParams = JSON.parse(JSON.stringify(options))
  if ((value.language?.trim().length ?? 0) > 32) throw new Error('语言标识最多 32 个字符')
  value.language = value.language?.trim() || undefined
  if (value.dpi !== undefined && (!Number.isInteger(value.dpi) || value.dpi < 100 || value.dpi > 300)) throw new Error('DPI 必须为 100～300 的整数')
  if (![0, 90, 180, 270].includes(value.rotationDegrees ?? 0)) throw new Error('旋转角度仅支持 0、90、180、270')
  if (pageText.trim()) {
    const pages = new Set<number>()
    for (const part of pageText.split(/[,，]/)) {
      const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part)
      if (!match) throw new Error('页码请填写 1,3-5 这样的格式')
      const start = Number(match[1]), end = Number(match[2] ?? match[1])
      if (start < 1 || end > 1000 || end < start || end - start >= 50) throw new Error('页码范围为 1～1000，单次最多 50 页')
      for (let page = start; page <= end; page++) pages.add(page)
      if (pages.size > 50) throw new Error('单次最多识别 50 页')
    }
    value.pages = [...pages].sort((a, b) => a - b)
    if (image && value.pages.some(page => page !== 1)) throw new Error('图片只支持第 1 页')
  } else value.pages = undefined
  if (image) value.dpi = undefined
  if (value.region && (Object.values(value.region).some(n => !Number.isSafeInteger(n))
    || value.region.x < 0 || value.region.y < 0 || value.region.width < 1 || value.region.height < 1)) {
    throw new Error('区域坐标必须为非负整数，宽高必须为正整数')
  }
  return value
}
