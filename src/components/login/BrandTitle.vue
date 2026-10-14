<script setup lang="ts">
/**
 * @file BrandTitle.vue
 * @description 登录页品牌区组件：顶部「文枢」品牌名 + 下方圆形标识。
 *
 *              本组件运行在登录表单的【设计稿画布坐标系】内（画布宽 305，
 *              由 LoginView 统一等比缩放），因此所有尺寸均使用设计稿像素，
 *              根节点固定为 305×215、绝对定位于画布顶部。
 *
 *              设计稿实测坐标（已换算为画布坐标，原点为品牌区左上角）：
 *                · 「文枢」字形  字号在设计稿 85pt 基础上经两轮缩小（先 −30% 再 −15%，
 *                  最终 50.6px），字距加大至 32px，500 字重，在原字形区内垂直、水平居中；
 *                · 圆形标识      直径 104，top=110，水平居中，与标题净距 13px。
 *              设计稿圆形原为浅蓝实心占位块，按视觉要求改为与线稿一致的
 *              黑色描边圆环（fill:none + stroke 墨色），不填充任何颜色。
 *
 *              字体：中文 Noto Serif SC，品牌名用 500 字重（全局样式已设置）。
 */

/// 品牌名字号（设计稿 85pt 经两轮缩小：先缩 30% 得 59.5，再缩 15% 得 ≈50.6）
const NAME_FONT_SIZE = 50.6
/// 品牌名字间距（经两轮加大：8 → 16 → 32）
const NAME_LETTER_SPACING = 32
/// 品牌名距画布顶部距离：字号缩小后在原 85px 字形区（y≈21~97，高 76）内
/// 垂直居中放置，保持与下方圆环的相对间距不因字号变化而改变：
/// 21 + (76 − 50.6) / 2 ≈ 34
const NAME_TOP = 34

/// 圆形标识直径（设计稿实测 104px）
const MARK_SIZE = 104
/// 圆形标识距画布顶部距离（实测 top=110，与标题净距约 13px）
const MARK_TOP = 110
/// 圆形描边宽度（与线稿插画外框同量级，克制）
const MARK_STROKE = 1.5
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

    <!-- 圆形标识：黑色描边圆环，无填充，与线稿插画同一视觉语言 -->
    <span
      class="brand-title__mark"
      :style="{
        top: `${MARK_TOP}px`,
        width: `${MARK_SIZE}px`,
        height: `${MARK_SIZE}px`,
        borderWidth: `${MARK_STROKE}px`,
      }"
      aria-hidden="true"
    />
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

  // 圆形标识：水平居中（left:50% + 自身左移一半），描边圆环
  &__mark {
    position: absolute;
    left: 50%;
    display: block;
    box-sizing: border-box;
    border-style: solid;
    border-color: $ink;
    border-radius: 50%;
    background: transparent;
    transform: translateX(-50%);
  }
}
</style>
