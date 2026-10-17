<script setup lang="ts">
/**
 * @file 认证页共享布局（登录 / 注册 / 找回密码 / 修改密码）
 * @description 四页共用同一套视觉骨架，差异仅在画布内的表单与链接，
 *              由默认插槽提供。布局内固定包含：
 *
 *                1) decor-stage：1280×800 设计舞台，cover 等比缩放居中，
 *                   内含右下三张 -22° 线稿纸（数据与几何来自 useAuthStage）；
 *                2) 英文角标：左上 Welcome（左边距 = edgeGap）、右上业务角标
 *                   （文案由 rightCornerText 传入，右边距 = edgeGap），另渲染一个
 *                   隐藏的「Log In」基准元素量取与登录页完全一致的边距；
 *                3) form-frame：视口水平居中、内容中心置于 42.3vh，内部 305×503
 *                   设计稿画布按框宽等比缩放；画布顶部固定为品牌区 BrandTitle，
 *                   其下为页面插槽。
 *
 *              插槽元素可用的定位 / 文案类（样式由本组件 :slotted 统一提供，
 *              视图层不再写任何 CSS）：
 *                · auth-page__field / --form   表单槽位包装（305 宽，top 行内样式给定）
 *                · auth-page__notice           服务端错误 / 成功提示（12px 墨色）
 *                · auth-page__link-row         底部两端对齐链接行（登录页用）
 *                · auth-page__link             链接文字样式（13px 次级墨色，hover 下划线）
 *                · auth-page__link--center     单条居中、绝对定位的链接（其余三页用）
 */
import BrandTitle from '@/components/login/BrandTitle.vue'
import PaperDoc from '@/components/illustration/PaperDoc.vue'
import {
  AUTH_SHEETS,
  CORNER_ANCHOR_VW,
  FORM_DESIGN_HEIGHT,
  FORM_DESIGN_WIDTH,
  SHEET_ROTATE,
  SHEET_WIDTH,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  useAuthStage,
} from '@/composables/useAuthStage'

/**
 * 右角标文案（随页面语义变化：Log In / Sign Up / Reset / Settings）；
 * 左角标固定为 Welcome
 */
defineProps<{
  rightCornerText: string
}>()

const { stageScale, formScale, formFrameEl, cornerProbeEl, edgeGap } = useAuthStage()
</script>

<template>
  <main class="auth-page">
    <!-- ============ 装饰层：1280×800 舞台，cover 缩放，右下出血 ============ -->
    <div
      class="auth-page__decor-stage"
      :style="{
        width: `${STAGE_WIDTH}px`,
        height: `${STAGE_HEIGHT}px`,
        transform: `translate(-50%, -50%) scale(${stageScale})`,
      }"
      aria-hidden="true"
    >
      <!-- 三张倾斜线稿纸 -->
      <div class="auth-page__decor">
        <div
          v-for="(sheet, index) in AUTH_SHEETS"
          :key="sheet.id"
          class="auth-page__sheet"
          :style="{
            left: `${sheet.cx - SHEET_WIDTH / 2}px`,
            top: `${sheet.cy}px`,
            width: `${SHEET_WIDTH}px`,
            transform: `translateY(-50%) rotate(${SHEET_ROTATE}deg)`,
            zIndex: index + 1,
          }"
        >
          <PaperDoc :variant="sheet.variant" />
        </div>
      </div>
    </div>

    <!-- 英文角标：左 Welcome / 右业务文案，两侧边距都等于登录页基准边距。
         中间隐藏的「Log In」基准元素只用于量距，不可见、不参与交互。 -->
    <span
      class="auth-page__corner auth-page__corner--left"
      :style="{ left: `${edgeGap}px` }"
      aria-hidden="true"
    >Welcome</span>
    <span
      ref="cornerProbeEl"
      class="auth-page__corner auth-page__corner--probe"
      :style="{ left: `${CORNER_ANCHOR_VW}vw` }"
      aria-hidden="true"
    >Log In</span>
    <span
      class="auth-page__corner auth-page__corner--right"
      :style="{ right: `${edgeGap}px` }"
      aria-hidden="true"
    >{{ rightCornerText }}</span>

    <!-- ============ 表单层：视口居中、重心略偏上，内部按 305 设计稿缩放 ============ -->
    <div class="auth-page__content">
      <div ref="formFrameEl" class="auth-page__frame">
        <div
          class="auth-page__canvas"
          :style="{
            width: `${FORM_DESIGN_WIDTH}px`,
            height: `${FORM_DESIGN_HEIGHT}px`,
            transform: `scale(${formScale})`,
          }"
        >
          <!-- 品牌区：文枢 + 键盘标识（四页统一） -->
          <BrandTitle />

          <!-- 页面专属内容：Tab / 表单 / 提示 / 链接 -->
          <slot />
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.auth-page {
  position: relative;
  // 锁死视口高度并裁切，防止表单超高产生文档滚动条（滚动条会挤偏水平居中）
  height: 100vh;
  overflow: hidden;

  /* ------------------------------ 装饰层 ------------------------------ */

  // 装饰舞台以视口中心为缩放原点（cover 出血）
  &__decor-stage {
    position: absolute;
    left: 50%;
    top: 50%;
    transform-origin: center;
    z-index: 0;
    pointer-events: none;
  }

  &__decor {
    position: absolute;
    inset: 0;
  }

  // 单张纸：左上角定位 + translateY 垂直居中，旋转围绕自身中心
  &__sheet {
    position: absolute;
    transform-origin: center;
  }

  // 英文角标：直接相对视口定位（不随装饰舞台 cover 缩放被裁切）。
  // 字号 56/1280=4.375vw；行高 135/1280=10.547vw；顶边距 11/800=1.375vh。
  &__corner {
    position: absolute;
    top: 1.375vh;
    z-index: 1;
    font-family: $font-serif;
    font-size: 4.375vw;
    line-height: 10.547vw;
    color: $ink;
    white-space: nowrap;
    pointer-events: none;

    // Welcome：左边界距视口左边的距离由 JS 写入 left
    &--left {
      transform: none;
    }

    // 右角标：以【右边界】定位，右边距由 JS 写入 right
    &--right {
      left: auto;
      transform: none;
    }

    // 隐藏基准：与登录页右角标同款中心锚点与文案，仅用于量取边距。
    // 用 visibility 而非 display 隐藏，以保留布局盒供 getBoundingClientRect 测量
    &--probe {
      transform: translateX(-50%);
      visibility: hidden;
    }
  }

  /* ------------------------------ 表单层 ------------------------------ */

  // 表单定位层：水平居中；padding-top 42.3vh 作为表单内容中心基准，
  // 配合子框 translateY(-50%)，使表单内容中心精确落在视口 42.3% 高度
  &__content {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    justify-content: center;
    padding-top: 42.3vh;
  }

  // 表单框：宽度 23.828vw，clamp 260~480，46vh 高度上限；
  // 高度固定按宽高比 305:503 自适应，整体缩放比、框尺寸、字间距四页一致
  &__frame {
    position: relative;
    width: min(clamp(260px, 23.828vw, 480px), 46vh);
    aspect-ratio: 305 / 503;
    flex: none;
    // 关键：父容器是 flex（交叉轴为纵向），默认 stretch 会用容器高覆盖
    // aspect-ratio 算出的高度，导致框体变形、内部画布下沉。改为 flex-start
    // 后高度严格等于 宽 × 503/305。
    align-self: flex-start;
    // 框体中心对齐到 42.3vh 基准点
    transform: translateY(-50%);
  }

  // 内部设计稿画布：固定 305×503，以左上角为原点缩放
  &__canvas {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: left top;
  }

  /* --------------------- 插槽元素（由各页面提供内容） --------------------- */

  // 表单槽位包装：305 宽，顶边距由页面以行内 top 坐标给定；
  // 单框默认高 37px，--form 高度由内部表单行自行撑开
  :slotted(.auth-page__field) {
    position: absolute;
    left: 0;
    width: 305px;
    height: 37px;
  }

  :slotted(.auth-page__field--form) {
    height: auto;
  }

  // 服务端错误 / 成功提示（绝对定位，不挤压布局）
  :slotted(.auth-page__notice) {
    position: absolute;
    left: 2px;
    font-family: $font-serif;
    font-weight: $weight-normal;
    font-size: 12px;
    line-height: 1.4;
    color: $ink;
    white-space: nowrap;
    pointer-events: none;
  }

  // 底部两端对齐链接行（登录页：忘记密码？/ 还没有账号？注册）
  :slotted(.auth-page__link-row) {
    position: absolute;
    left: 0;
    width: 305px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  // 链接文字：次级墨色，hover / 键盘聚焦加深并出下划线
  :slotted(.auth-page__link) {
    font-family: $font-serif;
    font-weight: $weight-normal;
    font-size: 13px;
    line-height: 1.4;
    text-decoration: none;
    color: $ink-soft;
    transition: color $transition-fast;
  }

  :slotted(.auth-page__link:hover) {
    color: $ink;
    text-decoration: underline;
  }

  :slotted(.auth-page__link:focus-visible) {
    outline: none;
    color: $ink;
    text-decoration: underline;
  }

  // 单条居中链接（注册 / 找回 / 修改密码页）：绝对定位、305 宽内居中
  :slotted(.auth-page__link--center) {
    position: absolute;
    left: 0;
    width: 305px;
    text-align: center;
  }
}

// 小屏（<768px）：隐藏纸张装饰与角标；表单宽度取视口 86%，并受 46vh 高度约束
@media (max-width: 768px) {
  .auth-page {
    &__decor-stage,
    &__corner {
      display: none;
    }

    &__frame {
      width: min(86vw, 46vh);
    }
  }
}
</style>
