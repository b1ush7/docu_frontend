/**
 * @file 认证页共享舞台（登录 / 注册 / 找回密码 / 修改密码四页通用）
 * @description 四个认证页共用同一套「装饰层 + 表单层」解耦几何，本 composable
 *              统一收口三套计算，视图层只需通过 AuthLayout.vue 取用，不再各自复制：
 *
 *                1) 装饰舞台 cover 缩放：1280×800 设计舞台按宽高比取较大值等比
 *                   缩放居中（等价 background-size: cover），右下三张 -22° 线稿
 *                   纸随之出血，超出视口部分由页面裁切。
 *
 *                2) 表单画布等比缩放：内部坐标系固定 305×503（FORM_DESIGN_*），
 *                   按表单框实际渲染宽度除以设计宽度得到 scale，任意屏幕比例下
 *                   内部元素相对位置都与设计稿一致。
 *
 *                3) 英文角标左右对称：页面内渲染一个隐藏基准元素（文案「Log In」，
 *                   中心锚定 93.008vw，与登录页右角标原始位置完全相同），实测其
 *                   右边界到视口右边界的距离 edgeGap，再令左角标 Welcome 的左边距
 *                   与右角标的右边距都等于 edgeGap。于是无论右角标文案宽窄
 *                   （Log In / Sign Up / Reset / Settings）、字体切换或窗口缩放，
 *                   四角标距页面边界的距离始终与登录页原始基准一致。
 *                   登录页自身也走同一数学：可见的「Log In」与隐藏基准同文案同字体，
 *                   以 right: edgeGap 定位后其中心仍精确落在 93.008vw，位置不变。
 *
 *              resize / ResizeObserver 的注册与销毁在此统一管理，
 *              调用方无需编写任何生命周期样板。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'

/** 纸张版式（与 PaperDoc 的 variant 字面量保持一致） */
export type SheetVariant = 'newspaper' | 'magazine' | 'manifest'

/**
 * 单张纸在设计舞台上的布局（坐标原点为舞台左上角，单位设计稿像素）
 * @property id       实例标识
 * @property cx       中心点横坐标
 * @property cy       中心点纵坐标
 * @property variant  版式（三张纸互不相同）
 */
export interface SheetPosition {
  id: string
  cx: number
  cy: number
  variant: SheetVariant
}

/* ------------------------- 装饰舞台常量（设计稿像素） ------------------------- */

/** 设计舞台尺寸（与设计稿画布一致） */
export const STAGE_WIDTH = 1280
export const STAGE_HEIGHT = 800

/** 纸张统一倾斜角（Sketch 记为 +22°，屏幕坐标下即 -22deg） */
export const SHEET_ROTATE = -22

/** 单张纸原始宽度（高度由 SVG 宽高比自适应，为 533） */
export const SHEET_WIDTH = 424

/** 三张纸的布局：最左杂志 / 中间单据 / 最右报纸 */
export const AUTH_SHEETS: readonly SheetPosition[] = [
  { id: 'sheet-left', cx: 321, cy: 977, variant: 'magazine' },
  { id: 'sheet-mid', cx: 741, cy: 807, variant: 'manifest' },
  { id: 'sheet-right', cx: 1161, cy: 636, variant: 'newspaper' },
]

/* --------------------------- 表单画布常量（设计稿像素） --------------------------- */

/** 表单内部设计稿宽度；所有槽位元素均按此坐标系编写 */
export const FORM_DESIGN_WIDTH = 305

/**
 * 表单坐标空间总高。行距收紧后最下方元素结束于 y≈449，底部为透明留白，
 * 固定总高保证表单整体缩放比、框体尺寸、视觉重心在四页之间完全一致。
 */
export const FORM_DESIGN_HEIGHT = 503

/** 隐藏基准角标「Log In」的中心锚点（vw；即登录页右角标的原始设计位置） */
export const CORNER_ANCHOR_VW = 93.008

/** useAuthStage 返回的舞台状态与模板引用 */
export interface AuthStage {
  /** 装饰舞台 cover 缩放比（写入 decor-stage 的 transform） */
  stageScale: Ref<number>
  /** 表单画布缩放比（渲染宽度 / 设计宽度） */
  formScale: Ref<number>
  /** 表单框外层元素引用（挂到 __frame 上测量实际宽度） */
  formFrameEl: Ref<HTMLDivElement | null>
  /** 隐藏「Log In」基准角标引用（必须真实挂载，漏挂会使 edgeGap 恒为视口宽） */
  cornerProbeEl: Ref<HTMLSpanElement | null>
  /** 角标距所在侧视口边界的距离（px），分别写入左角标 left 与右角标 right */
  edgeGap: Ref<number>
}

/**
 * 注册认证页共享舞台的全部响应式状态与监听
 * @returns 见 {@link AuthStage}
 */
export function useAuthStage(): AuthStage {
  /** 装饰舞台 cover 缩放比 */
  const stageScale = ref(1)
  /** 表单内部等比缩放比 */
  const formScale = ref(1)
  /** 表单框外层引用 */
  const formFrameEl = ref<HTMLDivElement | null>(null)
  /** 隐藏基准角标引用 */
  const cornerProbeEl = ref<HTMLSpanElement | null>(null)
  /** 角标距视口边界的距离 */
  const edgeGap = ref(0)

  /** 监听表单框宽度变化（ResizeObserver 句柄，卸载时断开） */
  let formResizeObserver: ResizeObserver | null = null
  /** 监听基准角标宽度变化（字体切换会改变字宽） */
  let cornerResizeObserver: ResizeObserver | null = null

  /** 取宽比、高比中较大者，保证装饰舞台始终 cover 铺满视口 */
  function updateStageScale(): void {
    stageScale.value = Math.max(
      window.innerWidth / STAGE_WIDTH,
      window.innerHeight / STAGE_HEIGHT,
    )
  }

  /** 实测隐藏基准角标的右边界，得出与登录页一致的两侧边距 */
  function alignCorners(): void {
    const probe = cornerProbeEl.value
    if (!probe) {
      return
    }
    edgeGap.value = Math.max(0, window.innerWidth - probe.getBoundingClientRect().right)
  }

  onMounted(() => {
    updateStageScale()
    window.addEventListener('resize', updateStageScale)

    if (formFrameEl.value) {
      formResizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) {
          formScale.value = entry.contentRect.width / FORM_DESIGN_WIDTH
        }
      })
      formResizeObserver.observe(formFrameEl.value)
    }

    alignCorners()
    window.addEventListener('resize', alignCorners)
    if (cornerProbeEl.value) {
      cornerResizeObserver = new ResizeObserver(alignCorners)
      cornerResizeObserver.observe(cornerProbeEl.value)
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateStageScale)
    window.removeEventListener('resize', alignCorners)
    formResizeObserver?.disconnect()
    cornerResizeObserver?.disconnect()
  })

  return { stageScale, formScale, formFrameEl, cornerProbeEl, edgeGap }
}
