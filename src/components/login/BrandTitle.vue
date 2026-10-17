<script setup lang="ts">
/**
 * @file BrandTitle.vue
 * @description 登录页品牌区组件：顶部「文枢」品牌名 + 下方键盘标识。
 *
 *              本组件运行在登录表单的【设计稿画布坐标系】内（画布宽 305，
 *              由 LoginView 统一等比缩放），因此所有尺寸均使用设计稿像素，
 *              根节点固定为 305×215、绝对定位于画布顶部。
 *
 *              设计稿实测坐标（已换算为画布坐标，原点为品牌区左上角）：
 *                · 「文枢」字形  字号在设计稿 85pt 基础上经两轮缩小（先 −30% 再 −15%，
 *                  最终 50.6px），字距加大至 32px，500 字重，在原字形区内垂直、水平居中；
 *                · 键盘标识      外接盒沿用原圆形标识的 104×104、top=110，水平居中，
 *                  键盘在盒内垂直居中，视觉重心与原圆环一致。
 *
 *              键盘线稿（参照用户提供的键盘示意图重绘，只保留键盘本体、
 *              去掉底色与投影）：
 *                · 纯描边、无填充，stroke 使用 currentColor 继承全站墨色 #2B2B2B，
 *                  与三张线稿插画同一视觉语言；
 *                · 圆角机身 + 4 行键位（第 2 行末键加宽为回车、底行中央长空格），
 *                  右上角三枚指示灯；所有拐角均为圆角衔接，无折角；
 *                · 键位区到机身轮廓的上、下边距一致（均以原上方边距 13 为准）；
 *                · 不透明度 0.6，与三张线稿插画保持同一柔和度；
 *                · 每个键位是独立的 <rect>；打字动画按「文枢」拼音 w-e-n-s-h-u
 *                  的顺序依次把对应键帽填为墨色实色，一轮打完停留片刻后循环往复；
 *                  用户偏好减少动效时保持静态线稿。
 *
 *              字体：中文 Noto Serif SC，品牌名用 500 字重（全局样式已设置）。
 */

import { onBeforeUnmount, onMounted, ref } from 'vue'

/// 品牌名字号（设计稿 85pt 经两轮缩小：先缩 30% 得 59.5，再缩 15% 得 ≈50.6）
const NAME_FONT_SIZE = 50.6
/// 品牌名字间距（经两轮加大：8 → 16 → 32）
const NAME_LETTER_SPACING = 32
/// 品牌名距画布顶部距离：字号缩小后在原 85px 字形区（y≈21~97，高 76）内
/// 垂直居中放置，保持与下方圆环的相对间距不因字号变化而改变：
/// 21 + (76 − 50.6) / 2 ≈ 34
const NAME_TOP = 34

/// 键盘标识外接盒尺寸（沿用原圆形标识的 104×104，保持品牌区布局不变）
const MARK_SIZE = 104
/// 键盘标识距画布顶部距离（沿用原圆形标识的 top=110）
const MARK_TOP = 110

/* ---------------------------- 键盘线稿几何 ---------------------------- */

/** 单个键位（viewBox 0 0 128 56 内坐标） */
interface KeyDef {
  x: number
  y: number
  w: number
  h: number
}

/// 键位区总宽（机身内框左右各留 7 的边距）
const KEYS_TOTAL_W = 114
/// 键位区起始坐标：上边距缩减 15%（13 → 11.05），起点 y = 2 + 11.05 = 13.05
const KEYS_X0 = 7
const KEYS_Y0 = 13.05
/// 键高与横纵键距（行距 3.6 + 键高 5.475：键位区跨距扩为 32.7，
/// 键盘外框不变、上下边距同为 11.05，行与行之间进一步舒展）
const KEY_H = 5.475
const KEY_GAP_X = 1.8
const KEY_GAP_Y = 3.6

/** 生成一行键位：按给定宽度序列自左向右排布 */
function buildRow(rowIndex: number, widths: readonly number[]): KeyDef[] {
  const y = KEYS_Y0 + rowIndex * (KEY_H + KEY_GAP_Y)
  let x = KEYS_X0
  return widths.map((w) => {
    const key: KeyDef = { x, y, w, h: KEY_H }
    x += w + KEY_GAP_X
    return key
  })
}

/** 等分宽度：count 个键铺满键位区 */
function uniformWidths(count: number): number[] {
  const w = (KEYS_TOTAL_W - (count - 1) * KEY_GAP_X) / count
  return Array.from({ length: count }, () => w)
}

/** 末键加宽（回车键）：前 count-1 个等宽 + 末键 wideW */
function wideLastWidths(count: number, wideW: number): number[] {
  const normal = (KEYS_TOTAL_W - (count - 1) * KEY_GAP_X - wideW) / (count - 1)
  return [...Array.from({ length: count - 1 }, () => normal), wideW]
}

/** 底行：两侧各 2 个等宽键 + 中央长空格 */
function bottomRowWidths(sideW: number): number[] {
  const space = KEYS_TOTAL_W - 4 * sideW - 4 * KEY_GAP_X
  return [sideW, sideW, space, sideW, sideW]
}

/// 第 4 行单键宽度（底行两侧键与之同宽）
const ROW4_KEY_W = (KEYS_TOTAL_W - 9 * KEY_GAP_X) / 10

/// 四行键位（命名行，便于按 QWERTY 相对位置定位字母键）
const KEY_ROW_0 = buildRow(0, uniformWidths(11)) // q w e r t y u i o p ⌫
const KEY_ROW_1 = buildRow(1, wideLastWidths(10, 16)) // a s d f g h j k l ⏎
const KEY_ROW_2 = buildRow(2, uniformWidths(10)) // ⇧ z x c v b n m , .
const KEY_ROW_3 = buildRow(3, bottomRowWidths(ROW4_KEY_W)) // 修饰键 + 长空格

/// 全部键位（4 行：已去除原第一行；逐键独立元素，供按键动画按索引选取）
const KEYBOARD_KEYS: KeyDef[] = [...KEY_ROW_0, ...KEY_ROW_1, ...KEY_ROW_2, ...KEY_ROW_3]

/// 右上角三枚指示灯（线稿小圆，描边不填充；cy 在上边栏 2~13.05 内垂直居中）
const INDICATOR_DOTS = [106, 112.5, 119].map((cx) => ({ cx, cy: 7.5, r: 1.7 }))

/* ---------------------------- 打字动画 ---------------------------- */

/**
 * 「文枢」拼音 wēn shū 的击键序列（KEYBOARD_KEYS 扁平索引）。
 * 键帽无刻字，按 QWERTY 相对位置取键：
 *   w = 行0[1] → 1    e = 行0[2] → 2    n = 行2[6] → 27
 *   s = 行1[1] → 12   h = 行1[5] → 16   u = 行0[6] → 6
 */
const TYPING_SEQUENCE: readonly number[] = [1, 2, 27, 12, 16, 6]

/// 当前按下的键（-1 表示无；为对应键帽触发实色填充）
const activeKeyIndex = ref(-1)

/// 击键间隔（ms）：每 0.4s 按下一键
const KEY_STEP_MS = 400
/// 一轮打完后的停留（ms）：清空高亮后稍歇再循环
const LOOP_PAUSE_MS = 800

let typingTimer: number | null = null

/** 按序列逐键高亮；一轮结束后清空高亮、停留片刻，再从头循环 */
function runTypingLoop(step = 0): void {
  if (step >= TYPING_SEQUENCE.length) {
    activeKeyIndex.value = -1
    typingTimer = window.setTimeout(() => runTypingLoop(0), LOOP_PAUSE_MS)
    return
  }
  activeKeyIndex.value = TYPING_SEQUENCE[step] ?? -1
  typingTimer = window.setTimeout(() => runTypingLoop(step + 1), KEY_STEP_MS)
}

onMounted(() => {
  // 用户偏好减少动效时不播放，键帽保持静态线稿
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }
  runTypingLoop()
})

onBeforeUnmount(() => {
  if (typingTimer !== null) {
    window.clearTimeout(typingTimer)
  }
})
</script>

<template>
  <div class="brand-title">
    <!-- 品牌名：文枢（500 字重宋体，墨色，水平居中） -->
    <h1
      class="brand-title__name"
      :style="{
        top: `${NAME_TOP}px`,
        fontSize: `${NAME_FONT_SIZE}px`,
        letterSpacing: `${NAME_LETTER_SPACING}px`,
        textIndent: `${NAME_LETTER_SPACING}px`,
      }"
    >
      文枢
    </h1>

    <!-- 键盘标识：纯描边线稿（无填充、圆角衔接），与线稿插画同一墨色语言；
         键位为逐键独立 <rect>，便于后续做按键动画 -->
    <span
      class="brand-title__mark"
      :style="{
        top: `${MARK_TOP}px`,
        width: `${MARK_SIZE}px`,
        height: `${MARK_SIZE}px`,
      }"
      aria-hidden="true"
    >
      <svg class="brand-title__keyboard" viewBox="0 0 128 58.8">
        <!-- 机身轮廓：键位区顶距 11.05（y2→13.05）、底距同为 11.05（键底 45.75→56.8） -->
        <rect
          class="brand-title__keyboard-frame"
          x="2"
          y="2"
          width="124"
          height="54.8"
          rx="7"
        />
        <circle
          v-for="(dot, index) in INDICATOR_DOTS"
          :key="`dot-${index}`"
          class="brand-title__keyboard-dot"
          :cx="dot.cx"
          :cy="dot.cy"
          :r="dot.r"
        />
        <rect
          v-for="(key, index) in KEYBOARD_KEYS"
          :key="`key-${index}`"
          class="brand-title__key"
          :class="{ 'brand-title__key--active': index === activeKeyIndex }"
          :x="key.x"
          :y="key.y"
          :width="key.w"
          :height="key.h"
          rx="1.6"
        />
      </svg>
    </span>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// 根节点：占据画布内品牌区 305×215，绝对定位由父画布统一缩放
.brand-title {
  position: absolute;
  top: 0;
  left: 0;
  width: 305px;
  height: 215px;

  // 品牌名：脱离文档流按实测 y 放置，字重 500、墨色、字距微张以贴合宋体气质
  &__name {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    font-weight: $weight-medium;
    line-height: 1;
    color: $ink;
    text-align: center;
    // 字距与居中等量补偿（text-indent）由内联样式按常量注入，保持严格居中
  }

  // 键盘标识容器：水平居中（left:50% + 自身左移一半），内部 flex 使键盘
  // 在 104 盒内垂直居中，视觉重心与原圆环一致
  &__mark {
    position: absolute;
    left: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translateX(-50%);
  }

  // 键盘线稿：宽度铺满外接盒，高度按 viewBox 宽高比自适应；墨色走 currentColor；
  // 不透明度 0.6，与三张线稿插画（PaperDoc）保持同一柔和度
  &__keyboard {
    display: block;
    width: 100%;
    height: auto;
    color: $ink;
    opacity: 0.6;
  }

  // 统一线稿语言：纯描边、无填充、圆角衔接（无折角）
  &__keyboard-frame,
  &__keyboard-dot,
  &__key {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  // 描边宽度按 viewBox 单位设置：渲染宽度 104 ≈ viewBox 128 的 0.81 倍，
  // 外框实际约 1.46px、键约 1.3px，与三张线稿插画的描边量级一致
  &__keyboard-frame {
    stroke-width: 1.8;
  }

  &__keyboard-dot {
    stroke-width: 1.5;
  }

  &__key {
    stroke-width: 1.6;
    // 按下/弹起时填充过渡，模拟击键的轻快节奏
    transition: fill 0.12s ease;

    // 按下的键帽：墨色实色填充（与描边同 currentColor）
    &--active {
      fill: currentColor;
    }
  }
}
</style>
