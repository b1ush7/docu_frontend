<script setup lang="ts">
/**
 * @file PaperDoc.vue
 * @description 线稿文档插画（纯 SVG，零外部图片依赖），替代设计稿中的灰色倾斜矩形块。
 *
 *              设计稿依据（1280×800 画布，PDF 像素 + Sketch 几何双重核对）：
 *              Sketch 中 shapePath 的 frame 是【旋转前】原始尺寸（非旋转包围盒）——
 *              经右块两个完整顶角 TL(865,469)/TR(1257,310) 实测：顶边长 423、倾角 -22.1°，
 *              配合中心 (1161,636) 反算，确定每张纸原始尺寸为 424×533、CSS rotate(-22deg)。
 *              三张纸中心沿自身水平轴相距 452.8，净缝 ≈29px。
 *              故本组件 viewBox 直接采用 424×533，使用方按 424px 宽放置即与灰块完全重合。
 *
 *              三张纸内容各不相同，通过 variant 属性提供三种版式：
 *                · 'newspaper' 报纸：双标题线 + 通栏行线 + 山形图位 + 头像 + 中缝双栏
 *                · 'magazine'  杂志：宽幅落日波浪图位 + 单栏长文行线 + 三联缩略图位
 *                · 'manifest'  单据：复选框清单 + 同心圆徽标 + 三栏数据行 + 签字线
 *              三种版式共用同一纸张外轮廓，仅内部排版/图位/图案不同，非简单复制。
 *
 *              描边规范：全部 fill:none、仅用 stroke；颜色 $ink(#2B2B2B)，
 *              stroke-width 1.3（外框 1.5、标题/签字线 2.2），linecap / linejoin 为 round。
 *
 *              旋转不由本组件负责：组件自身保持竖直，旋转角度与位置由使用方控制。
 */

/** 纸张版式类型：报纸 / 杂志 / 单据，三张纸必须使用不同版式 */
type PaperVariant = 'newspaper' | 'magazine' | 'manifest'

interface Props {
  /** 版式，默认报纸 */
  variant?: PaperVariant
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'newspaper',
})

/// viewBox 画布尺寸（与设计稿纸张原始尺寸一致：424×533）
const VB_W = 424
const VB_H = 533
/// 内部内容组横向 skew 角度：轻微透视，过大会失真
const CONTENT_SKEW_X = -2
/// 页面左右安全边距，内容统一在 L..R 之间
const PAD_X = 30
const CONTENT_RIGHT = VB_W - PAD_X
/// skew 中心：画布中心
const VB_CX = VB_W / 2
const VB_CY = VB_H / 2

/** 通用行线：y 为纵向坐标，x2 为右端点（左端固定，不等长模拟排版） */
interface DocLine {
  y: number
  x2: number
}

/* ============================ 版式一：报纸 ============================ */

/** 上组：通栏正文行线（行高 16，右端有意长短不一） */
const newsTopLines: DocLine[] = [
  { y: 138, x2: CONTENT_RIGHT },
  { y: 154, x2: 366 },
  { y: 170, x2: CONTENT_RIGHT },
  { y: 186, x2: 330 },
  { y: 202, x2: CONTENT_RIGHT },
]
/** 下组左栏行线（竖中缝 x=212） */
const newsLeftLines: DocLine[] = [
  { y: 356, x2: 190 },
  { y: 372, x2: 198 },
  { y: 388, x2: 182 },
  { y: 404, x2: 198 },
  { y: 420, x2: 172 },
  { y: 436, x2: 194 },
  { y: 452, x2: 184 },
  { y: 468, x2: 196 },
]
/** 下组右栏行线（与左栏轻微错位，更像报纸排版） */
const newsRightLines: DocLine[] = [
  { y: 362, x2: 384 },
  { y: 378, x2: CONTENT_RIGHT },
  { y: 394, x2: 376 },
  { y: 410, x2: CONTENT_RIGHT },
  { y: 426, x2: 362 },
  { y: 442, x2: 388 },
  { y: 458, x2: 378 },
  { y: 474, x2: CONTENT_RIGHT },
]

/* ============================ 版式二：杂志 ============================ */

/** 宽幅图位下方的单栏长文行线（行高 15，右端交错） */
const magBodyLines: DocLine[] = [
  { y: 268, x2: CONTENT_RIGHT },
  { y: 283, x2: 376 },
  { y: 298, x2: CONTENT_RIGHT },
  { y: 313, x2: 348 },
  { y: 328, x2: 390 },
  { y: 343, x2: CONTENT_RIGHT },
  { y: 358, x2: 360 },
  { y: 373, x2: CONTENT_RIGHT },
  { y: 388, x2: 372 },
]

/// 三联缩略图：内容宽 364，三图各 104，间隙 26；纵向 y 与尺寸
const THUMB_Y = 404
const THUMB_W = 104
const THUMB_H = 80
const THUMB_GAP = 26
const magThumbs: { x: number }[] = [
  { x: PAD_X },
  { x: PAD_X + THUMB_W + THUMB_GAP },
  { x: PAD_X + 2 * (THUMB_W + THUMB_GAP) },
]

/* ============================ 版式三：单据 ============================ */

/** 复选框清单项：y 为行线纵坐标，x2 为行线右端，复选框随行线垂直居中 */
interface ManifestRow {
  y: number
  x2: number
}
const manifestRows: ManifestRow[] = [
  { y: 142, x2: CONTENT_RIGHT },
  { y: 170, x2: 372 },
  { y: 198, x2: 388 },
  { y: 226, x2: 344 },
  { y: 254, x2: CONTENT_RIGHT },
  { y: 282, x2: 360 },
]
/// 复选框边长、行线起点（复选框右侧留 16px 空隙）
const CHECK_SIZE = 16
const CHECK_TEXT_X = PAD_X + CHECK_SIZE + 16

/** 下方三栏数据行（每栏 7 行短行线，行高 22，竖分隔线区分） */
const manifestColumnY = [328, 350, 372, 394, 416, 438, 460]
/** 三栏各自的行线起点 / 右端点 */
const manifestColumns: { x1: number; ends: number[] }[] = [
  // 左栏
  { x1: PAD_X, ends: [136, 126, 138, 118, 134, 124, 136] },
  // 中栏
  { x1: 172, ends: [254, 244, 256, 236, 252, 242, 254] },
  // 右栏
  { x1: 292, ends: [392, 380, 394, 366, 390, 376, 392] },
]
/// 单据三栏竖分隔线的 x 坐标
const MANIFEST_DIVIDERS = [154, 274]
</script>

<template>
  <svg
    class="paper-doc"
    :viewBox="`0 0 ${VB_W} ${VB_H}`"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- 纸张外轮廓（三种版式共用）：四边二次贝塞尔做极轻微手绘起伏 -->
    <path
      class="paper-doc__outline"
      d="M10 12 Q212 6 414 12 L416 521 Q212 528 12 521 L10 12 Z"
    />

    <!-- 内容组：围绕画布中心轻微 skew，制造纸张透视 -->
    <g
      :transform="`translate(${VB_CX} ${VB_CY}) skewX(${CONTENT_SKEW_X}) translate(${-VB_CX} ${-VB_CY})`"
    >
      <!-- ============ 版式一：报纸 ============ -->
      <g v-if="props.variant === 'newspaper'">
        <!-- 报头：眉题短线 + 两条不等宽标题线 + 双分隔线 -->
        <line :x1="PAD_X" y1="52" x2="150" y2="52" />
        <line class="paper-doc__title" :x1="PAD_X" y1="74" x2="320" y2="74" />
        <line class="paper-doc__title" :x1="PAD_X" y1="98" x2="250" y2="98" />
        <line :x1="PAD_X" y1="116" :x2="CONTENT_RIGHT" y2="116" />
        <line :x1="PAD_X" y1="120" :x2="CONTENT_RIGHT" y2="120" />

        <!-- 通栏正文行线 -->
        <line
          v-for="(line, i) in newsTopLines"
          :key="`n-top-${i}`"
          :x1="PAD_X"
          :y1="line.y"
          :x2="line.x2"
          :y2="line.y"
        />

        <!-- 矩形图位 + 山形折线 -->
        <rect :x="PAD_X" y="224" width="190" height="110" />
        <polyline points="38,326 74,280 104,314 138,268 212,326" />

        <!-- 圆形头像位：圆头 + 肩线 -->
        <circle cx="330" cy="262" r="30" />
        <path d="M280 330 Q330 288 380 330" />

        <!-- 中缝双栏 -->
        <line x1="212" y1="348" x2="212" y2="482" />
        <line
          v-for="(line, i) in newsLeftLines"
          :key="`n-l-${i}`"
          :x1="PAD_X"
          :y1="line.y"
          :x2="line.x2"
          :y2="line.y"
        />
        <line
          v-for="(line, i) in newsRightLines"
          :key="`n-r-${i}`"
          x1="226"
          :y1="line.y"
          :x2="line.x2"
          :y2="line.y"
        />
      </g>

      <!-- ============ 版式二：杂志（单栏 + 宽幅插图） ============ -->
      <g v-else-if="props.variant === 'magazine'">
        <!-- 报头：左对齐标题区，一条通栏分隔线 -->
        <line :x1="PAD_X" y1="54" x2="120" y2="54" />
        <line class="paper-doc__title" :x1="PAD_X" y1="76" x2="350" y2="76" />
        <line :x1="PAD_X" y1="100" x2="240" y2="100" />
        <line :x1="PAD_X" y1="118" :x2="CONTENT_RIGHT" y2="118" />

        <!-- 宽幅横向图位：落日（上半圆弧 + 地平线）与双道波浪 -->
        <rect :x="PAD_X" y="134" width="364" height="110" />
        <!-- 落日半圆（sweep=0 在地平线上方起拱） -->
        <path d="M178 206 A 34 34 0 0 0 246 206" />
        <line x1="38" y1="206" x2="386" y2="206" />
        <!-- 两道波浪（二次贝塞尔起伏，节奏一快一慢） -->
        <path
          d="M38 222 Q 50 214 62 222 T 86 222 T 110 222 T 134 222 T 158 222 T 182 222 T 206 222 T 230 222 T 254 222 T 278 222 T 302 222 T 326 222 T 350 222 T 374 222 T 386 222"
        />
        <path
          d="M38 236 Q 58 228 78 236 T 118 236 T 158 236 T 198 236 T 238 236 T 278 236 T 318 236 T 358 236 T 386 236"
        />

        <!-- 单栏长文行线 -->
        <line
          v-for="(line, i) in magBodyLines"
          :key="`m-body-${i}`"
          :x1="PAD_X"
          :y1="line.y"
          :x2="line.x2"
          :y2="line.y"
        />

        <!-- 三联缩略图位：斜折线 / 十字 / 小旗，三种不同图案 -->
        <template v-for="(thumb, i) in magThumbs" :key="`m-thumb-${i}`">
          <rect
            :x="thumb.x"
            :y="THUMB_Y"
            :width="THUMB_W"
            :height="THUMB_H"
          />
          <!-- 第一幅：对角折线 -->
          <polyline
            v-if="i === 0"
            :points="`${thumb.x + 14},${THUMB_Y + THUMB_H - 16} ${thumb.x + THUMB_W / 2},${THUMB_Y + 20} ${thumb.x + THUMB_W - 14},${THUMB_Y + THUMB_H - 16}`"
          />
          <!-- 第二幅：十字准星 -->
          <g v-else-if="i === 1">
            <line
              :x1="thumb.x + THUMB_W / 2"
              :y1="THUMB_Y + 16"
              :x2="thumb.x + THUMB_W / 2"
              :y2="THUMB_Y + THUMB_H - 16"
            />
            <line
              :x1="thumb.x + 16"
              :y1="THUMB_Y + THUMB_H / 2"
              :x2="thumb.x + THUMB_W - 16"
              :y2="THUMB_Y + THUMB_H / 2"
            />
          </g>
          <!-- 第三幅：小旗（旗杆 + 旗面折线） -->
          <g v-else>
            <line
              :x1="thumb.x + 22"
              :y1="THUMB_Y + 16"
              :x2="thumb.x + 22"
              :y2="THUMB_Y + THUMB_H - 16"
            />
            <polyline
              :points="`${thumb.x + 22},${THUMB_Y + 20} ${thumb.x + THUMB_W - 20},${THUMB_Y + 28} ${thumb.x + 22},${THUMB_Y + 40}`"
            />
          </g>
        </template>

        <!-- 图注行线：一长一短 -->
        <line :x1="PAD_X" y1="504" :x2="CONTENT_RIGHT" y2="504" />
        <line :x1="PAD_X" y1="518" x2="300" y2="518" />
      </g>

      <!-- ============ 版式三：单据（清单 + 数据栏 + 签字） ============ -->
      <g v-else>
        <!-- 表头：三条左对齐等起线，长度递减，与报纸/杂志报头明显不同 -->
        <line :x1="PAD_X" y1="54" x2="240" y2="54" />
        <line class="paper-doc__title" :x1="PAD_X" y1="76" :x2="CONTENT_RIGHT" y2="76" />
        <line :x1="PAD_X" y1="96" x2="180" y2="96" />

        <!-- 右上角同心圆徽标：外圆 + 内圆 + 中心点 -->
        <circle cx="360" cy="72" r="34" />
        <circle cx="360" cy="72" r="20" />
        <circle cx="360" cy="72" r="3.5" />

        <!-- 表头分隔线 -->
        <line :x1="PAD_X" y1="118" :x2="CONTENT_RIGHT" y2="118" />

        <!-- 复选框清单：每行一个空心方框 + 一条行线 -->
        <template v-for="(row, i) in manifestRows" :key="`m-row-${i}`">
          <rect
            :x="PAD_X"
            :y="row.y - CHECK_SIZE / 2"
            :width="CHECK_SIZE"
            :height="CHECK_SIZE"
          />
          <line :x1="CHECK_TEXT_X" :y1="row.y" :x2="row.x2" :y2="row.y" />
        </template>

        <!-- 三栏数据区：两条竖分隔线 + 每栏 7 行短行线 -->
        <line
          v-for="(x, i) in MANIFEST_DIVIDERS"
          :key="`m-div-${i}`"
          :x1="x"
          y1="312"
          :x2="x"
          y2="472"
        />
        <g v-for="(col, ci) in manifestColumns" :key="`m-col-${ci}`">
          <line
            v-for="(y, ri) in manifestColumnY"
            :key="`m-c${ci}-${ri}`"
            :x1="col.x1"
            :y1="y"
            :x2="col.ends[ri]"
            :y2="y"
          />
        </g>

        <!-- 落款：粗签字线（左）+ 短日期线（右），同一基线 -->
        <line class="paper-doc__title" :x1="PAD_X" y1="498" x2="250" y2="498" />
        <line x1="296" y1="498" :x2="CONTENT_RIGHT" y2="498" />
        <line :x1="PAD_X" y1="514" x2="150" y2="514" />
      </g>
    </g>
  </svg>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.paper-doc {
  display: block;
  width: 100%;
  height: auto;
  opacity: 0.6;
  // 全局描边设定：镂空、墨色、圆头线帽
  fill: none;
  stroke: $ink;
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;

  // 外轮廓略粗于内部线，界定纸张边缘
  &__outline {
    stroke-width: 1.5;
  }

  // 标题线 / 签字线最粗，形成视觉层级
  &__title {
    stroke-width: 2.2;
  }
}
</style>
