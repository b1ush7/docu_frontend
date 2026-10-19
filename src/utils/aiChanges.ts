import type { AiChange } from '@/api/types'

const TYPES: Record<string, string> = {
  REPLACE_TEXT: '替换文本', INSERT_BEFORE: '在前面插入段落', INSERT_AFTER: '在后面插入段落',
  DELETE: '删除段落', SET_CELL_TEXT: '修改单元格文本', INSERT_IMAGE: '插入图片',
  FORMAT_PARAGRAPH: '设置段落格式', NORMALIZE_DOCX_FORMAT: '批量统一文档格式',
  RESIZE_DOCX_IMAGES: '统一已有图片尺寸', SET_FORMULA: '设置公式',
  CREATE_TABLE: '创建工作表与表格', CREATE_CHART: '创建图表',
}
const FORMATS: Record<string, string> = {
  SET_HEADING: '设置标题', SET_NORMAL: '设置正文', SET_BULLET: '设置项目符号',
  SET_NUMBERED: '设置编号列表', CLEAR_LIST: '清除列表',
  SET_PAGE_BREAK_BEFORE: '开启段前分页', CLEAR_PAGE_BREAK_BEFORE: '关闭段前分页',
}
const KEYS: Record<string, string> = {
  scope: '范围', headingLevel: '标题级别', fontFamily: '字体', fontSizePoints: '字号（磅）',
  lineSpacing: '行距（倍）', spaceBeforePoints: '段前（磅）', spaceAfterPoints: '段后（磅）',
  alignment: '对齐', bold: '加粗', italic: '斜体', includeTables: '包含表格',
  widthCm: '宽度（厘米）', heightCm: '高度（厘米）', keepAspectRatio: '保持比例',
}
const VALUES: Record<string, string> = {
  ALL: '全部正文与标题', BODY: '正文', HEADINGS: '标题',
  LEFT: '左对齐', CENTER: '居中', RIGHT: '右对齐', JUSTIFY: '两端对齐',
}
export function changeTypeLabel(type: string): string { return TYPES[type] ?? type }
export function changeBefore(change: AiChange): string {
  if (!change.beforeFormat) return change.before ?? ''
  const f = change.beforeFormat
  return [f.styleId ? `样式：${f.styleId}` : '无显式样式',
    f.headingLevel ? `${f.headingLevel} 级标题` : '', f.numberingFormat ? `列表：${f.numberingFormat}` : '',
    f.pageBreakBefore == null ? '' : `段前分页：${f.pageBreakBefore ? '开启' : '关闭'}`].filter(Boolean).join('；')
}
export function changeAfter(change: AiChange): string {
  if (change.image) {
    const i = change.image
    return `图片 #${i.fileId} 第 ${i.versionNo} 版；显示尺寸 ${i.widthPixels} × ${i.heightPixels} 像素`
  }
  if (change.format) {
    return `${FORMATS[change.format.type] ?? change.format.type}${change.format.level ? `（${change.format.level} 级）` : ''}`
  }
  if (['NORMALIZE_DOCX_FORMAT', 'RESIZE_DOCX_IMAGES'].includes(change.type) && change.after) {
    try {
      const options = JSON.parse(change.after) as Record<string, unknown>
      if (options && typeof options === 'object' && !Array.isArray(options)) {
        return Object.entries(options).filter(([, value]) => value !== null)
          .map(([key, value]) => `${KEYS[key] ?? key}：${typeof value === 'boolean' ? value ? '是' : '否' : VALUES[String(value)] ?? String(value)}`)
          .join('；')
      }
    } catch { /* Older/unknown plan content remains visible. */ }
  }
  return change.after ?? ''
}
