<script setup lang="ts">
/**
 * @file 找回密码页
 * @description 与登录页 / 注册页共用同一套「装饰层 + 表单层」解耦结构（详见 LoginView.vue
 *              顶部注释），装饰舞台、英文角标、画布缩放数学全部复用，仅表单内容不同：
 *
 *                1) 装饰层 decor-stage：固定 1280×800 设计舞台，cover 方式等比缩放居中，
 *                   内含右下三张 -22° 线稿纸，负责右下出血效果。
 *                2) 英文角标：左上 Welcome / 右上 Reset，距页面边界的距离通过隐藏基准元素
 *                   量取登录页「Log In」的右边距得到（alignCorners），因此与登录页完全一致。
 *                3) 表单层 form-frame：内部坐标系固定设计稿宽度 305，按容器实际宽度等比
 *                   缩放；垂直中心仍置于视口 42.3% 高度处，与登录页视觉重心一致。
 *
 *              本页无 Tab（只有一种操作），因此表单直接从品牌区下方排布：
 *                · 品牌区（文枢 + 104px 圆标识）   y=0   高 215 → BrandTitle
 *                · 找回密码表单                     y=234 起，行高 37px、间距 22px
 *                  - 手机号 / 验证码 / 新密码 / 重设按钮  共 4 行，底边 y=448
 *                · 服务端提示文案                   表单底边下方 8px（y=456）
 *                · 「想起密码了？返回登录」链接       提示文案下方一行（y=477）
 *
 *              重设成功后行为（依文档 P3：/user/reset-password 响应 data 为 null，
 *              **服务端会撤销该用户的全部会话**）：前端必须清空本地 Token 再跳登录页，
 *              否则残留的旧凭证会让「改密踢下线」失去意义。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import PaperDoc from '@/components/illustration/PaperDoc.vue'
import BrandTitle from '@/components/login/BrandTitle.vue'
import ResetPasswordForm from '@/components/reset/ResetPasswordForm.vue'
import { resetPassword, sendResetCode } from '@/api/auth'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

/** 纸张版式（与 PaperDoc 的 variant 字面量保持一致） */
type SheetVariant = 'newspaper' | 'magazine' | 'manifest'

/* ------------------------- 装饰层：设计舞台 ------------------------- */

/** 设计舞台尺寸（与设计稿画布一致，单位 px） */
const STAGE_WIDTH = 1280
const STAGE_HEIGHT = 800

/** 装饰舞台 cover 缩放比：取宽比、高比中较大者，保证装饰始终铺满视口 */
const stageScale = ref(1)

/** 依据当前视口尺寸重新计算装饰舞台缩放比 */
function updateStageScale(): void {
  stageScale.value = Math.max(
    window.innerWidth / STAGE_WIDTH,
    window.innerHeight / STAGE_HEIGHT,
  )
}

/** 设计稿纸张统一倾斜角（CSS 度数；Sketch 记为 +22°，屏幕坐标下即 -22deg） */
const SHEET_ROTATE = -22
/** 单张纸原始宽度（设计稿像素，高度由 SVG 宽高比自适应，为 533） */
const SHEET_WIDTH = 424

/**
 * 三张纸的布局数据（设计稿像素坐标，原点为舞台左上角）
 * @property id       实例标识
 * @property cx       中心点横坐标
 * @property cy       中心点纵坐标
 * @property variant  版式（三张纸互不相同）
 */
interface SheetPosition {
  id: string
  cx: number
  cy: number
  variant: SheetVariant
}

const sheets: SheetPosition[] = [
  // 最左（最后方）：杂志版式
  { id: 'sheet-left', cx: 321, cy: 977, variant: 'magazine' },
  // 中间：单据版式
  { id: 'sheet-mid', cx: 741, cy: 807, variant: 'manifest' },
  // 最右（最前方）：报纸版式
  { id: 'sheet-right', cx: 1161, cy: 636, variant: 'newspaper' },
]

/* --------------------------- 表单层：缩放 --------------------------- */

/** 表单内部设计稿宽度（px）；所有子元素均按此坐标系编写（与登录页一致） */
const FORM_DESIGN_WIDTH = 305
/** 表单坐标空间总高（与登录页一致，保证缩放比与视觉重心相同） */
const FORM_DESIGN_HEIGHT = 503

/** 表单框外层引用（用于测量实际渲染宽度） */
const formFrameEl = ref<HTMLDivElement | null>(null)
/** 表单内部等比缩放比 = 渲染宽度 / 设计宽度 */
const formScale = ref(1)

/** 隐藏基准元素引用：渲染登录页右角标文案「Log In」，用于量取登录页的边距 */
const logInProbeEl = ref<HTMLSpanElement | null>(null)
/**
 * 左右角标各自距所在侧视口边界的距离（px）。
 * 恒等于登录页右角标「Log In」右边距，保证两页角标距页面边界的距离完全一致。
 */
const edgeGap = ref(0)

let resizeObserver: ResizeObserver | null = null
/** 监听基准元素宽度变化（字体切换 / 窗口 resize 都会改变字宽），保持与登录页一致 */
let cornerResizeObserver: ResizeObserver | null = null
/** 重设成功后的跳转定时器句柄（组件卸载时清理） */
let redirectTimer: number | null = null

/**
 * 计算角标距视口边界的距离，使其与登录页完全一致。
 *
 * 登录页右角标「Log In」以文本【中心】锚定在 93.008vw 处，其右边界到视口右边的
 * 距离随字号（vw）等比变化。本页右角标文案「Reset」宽度不同，若改用同一中心锚点
 * 会外扩贴边，故用隐藏基准元素（同款文案「Log In」+ 同款锚点）量出登录页的真实
 * 边距 edgeGap，再让 Welcome 的左边距与 Reset 的右边距都等于它。
 */
function alignCorners(): void {
  const probe = logInProbeEl.value
  if (!probe) {
    return
  }
  edgeGap.value = Math.max(0, window.innerWidth - probe.getBoundingClientRect().right)
}

onMounted(() => {
  updateStageScale()
  window.addEventListener('resize', updateStageScale)

  // 监听表单框宽度变化，按设计稿宽度等比缩放内部坐标
  if (formFrameEl.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        formScale.value = entry.contentRect.width / FORM_DESIGN_WIDTH
      }
    })
    resizeObserver.observe(formFrameEl.value)
  }

  // 角标对齐：初次 + 基准元素宽度变化 + 窗口 resize 都重新计算
  alignCorners()
  window.addEventListener('resize', alignCorners)
  if (logInProbeEl.value) {
    cornerResizeObserver = new ResizeObserver(alignCorners)
    cornerResizeObserver.observe(logInProbeEl.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateStageScale)
  window.removeEventListener('resize', alignCorners)
  resizeObserver?.disconnect()
  cornerResizeObserver?.disconnect()
  if (redirectTimer !== null) {
    window.clearTimeout(redirectTimer)
  }
})

/* ------------------------------ 表单槽位 ------------------------------ */

/**
 * 表单首行（手机号）顶边距（设计稿像素）。本页无 Tab，表单从品牌区下方直接排布。
 * 四行（手机号 / 验证码 / 新密码 / 按钮）高 37px、间距 22px，由表单组件自行 flex 排版。
 */
const FIELD_1_TOP = 234
/** 服务端提示文案的顶边距：表单底边（234 + 3×59 + 37 = 448）下方 8px */
const NOTICE_TOP = 456
/** 「想起密码了？返回登录」链接的顶边距 */
const LINK_TOP = 477

/** 重设成功后停留时长（ms），让用户看清成功文案再跳转登录页 */
const REDIRECT_DELAY = 900

/** 重设请求进行中标志 */
const submitting = ref(false)

/** 服务端返回的重设错误文案（显示在表单下方） */
const serverError = ref('')
/** 重设成功文案（显示在表单下方，随后自动跳转登录页） */
const successMessage = ref('')

/**
 * 重设密码提交（由 ResetPasswordForm 本地校验通过后触发）
 * @description POST /user/reset-password；成功后**先清空本地 Token**（服务端已撤销全部
 *              会话，残留凭证会让改密失效），再提示并跳转 /login。
 */
async function handleResetSubmit(payload: {
  phone: string
  code: string
  newPassword: string
}): Promise<void> {
  if (submitting.value) {
    return
  }
  submitting.value = true
  serverError.value = ''
  successMessage.value = ''
  try {
    await resetPassword(payload)
    userStore.clearAuth()
    successMessage.value = '密码已重置，正在前往登录…'
    redirectTimer = window.setTimeout(() => {
      void router.push('/login')
    }, REDIRECT_DELAY)
  } catch (error) {
    serverError.value = error instanceof Error ? error.message : '重置失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

/**
 * 发送验证码（透传给 ResetPasswordForm → CaptchaInput）
 * @description POST /user/reset-password/code；成功后返回 null，倒计时由 CaptchaInput 自行管理。
 * @param phone 已通过格式校验的手机号
 */
async function requestResetCode(phone: string): Promise<null> {
  await sendResetCode(phone)
  return null
}
</script>

<template>
  <main class="reset-page">
    <!-- ============ 装饰层：1280×800 舞台，cover 缩放，右下出血 ============ -->
    <div
      class="reset-page__decor-stage"
      :style="{
        width: `${STAGE_WIDTH}px`,
        height: `${STAGE_HEIGHT}px`,
        transform: `translate(-50%, -50%) scale(${stageScale})`,
      }"
      aria-hidden="true"
    >
      <!-- 三张倾斜线稿纸 -->
      <div class="reset-page__decor">
        <div
          v-for="(sheet, index) in sheets"
          :key="sheet.id"
          class="reset-page__sheet"
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

    <!-- 英文角标：左上 Welcome / 右上 Reset，两者距页面边界的距离由 alignCorners()
         动态写入，恒等于登录页右角标「Log In」的右边距（与登录页完全一致）。
         中间隐藏的「Log In」基准元素只用于量取该距离，不可见、不参与交互。 -->
    <span
      class="reset-page__corner reset-page__corner--left"
      :style="{ left: `${edgeGap}px` }"
      aria-hidden="true"
    >Welcome</span>
    <span
      ref="logInProbeEl"
      class="reset-page__corner reset-page__corner--probe"
      aria-hidden="true"
    >Log In</span>
    <span
      class="reset-page__corner reset-page__corner--right"
      :style="{ right: `${edgeGap}px` }"
      aria-hidden="true"
    >Reset</span>

    <!-- ============ 表单层：视口居中、重心略偏上，内部按 305 设计稿缩放 ============ -->
    <div class="reset-page__content">
      <div ref="formFrameEl" class="reset-page__frame">
        <div
          class="reset-page__canvas"
          :style="{
            width: `${FORM_DESIGN_WIDTH}px`,
            height: `${FORM_DESIGN_HEIGHT}px`,
            transform: `scale(${formScale})`,
          }"
        >
          <!-- 品牌区：文枢 + 圆形标识 -->
          <BrandTitle />

          <!-- 找回密码表单：手机号 / 验证码 / 新密码 / 重设按钮 -->
          <div
            class="reset-page__field reset-page__field--form"
            :style="{ top: `${FIELD_1_TOP}px` }"
          >
            <ResetPasswordForm
              :loading="submitting"
              :request-code="requestResetCode"
              @submit="handleResetSubmit"
            />
          </div>

          <!-- 服务端返回的重设错误 / 成功文案（显示在表单下方，不挤压布局） -->
          <span
            v-if="serverError"
            class="reset-page__notice"
            :style="{ top: `${NOTICE_TOP}px` }"
            role="alert"
          >{{ serverError }}</span>
          <span
            v-else-if="successMessage"
            class="reset-page__notice"
            :style="{ top: `${NOTICE_TOP}px` }"
            role="status"
          >{{ successMessage }}</span>

          <!-- 想起密码了：返回登录页 -->
          <RouterLink
            class="reset-page__link"
            :style="{ top: `${LINK_TOP}px` }"
            to="/login"
          >想起密码了？返回登录</RouterLink>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.reset-page {
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

  // 英文角标：直接相对视口定位（不随装饰舞台 cover 缩放被裁切）
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

    // Welcome：左边界距视口左边界的距离由 JS 写入 left，无需中心锚点
    &--left {
      transform: none;
    }

    // Reset：以【右边界】定位（left: auto），右边距由 JS 写入 right，
    // 使其到视口右边界的距离恒等于登录页「Log In」的右边距
    &--right {
      left: auto;
      transform: none;
    }

    // 隐藏基准：与登录页右角标同款中心锚点与文案，仅用于量取边距。
    // 用 visibility 而非 display 隐藏，以保留布局盒供 getBoundingClientRect 测量
    &--probe {
      left: 93.008vw;
      transform: translateX(-50%);
      visibility: hidden;
    }
  }

  /* ------------------------------ 表单层 ------------------------------ */

  // 表单定位层：水平居中；padding-top 42.3vh 作为表单内容中心基准
  &__content {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    justify-content: center;
    padding-top: 42.3vh;
  }

  // 表单框：宽度公式与登录页一致，高度按 305:503 自适应
  &__frame {
    position: relative;
    width: min(clamp(260px, 23.828vw, 480px), 46vh);
    aspect-ratio: 305 / 503;
    flex: none;
    align-self: flex-start;
    transform: translateY(-50%);
  }

  // 内部设计稿画布：固定 305×503，以左上角为原点缩放
  &__canvas {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: left top;
  }

  // 表单组件的定位包装层：305 宽，顶部由画布坐标决定
  &__field {
    position: absolute;
    left: 0;
    width: 305px;
    height: 37px;

    &--form {
      height: auto;
    }
  }

  // 服务端错误 / 成功文案（显示在表单下方，不挤压布局）
  &__notice {
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

  // 「想起密码了？返回登录」：居中、次级墨色，hover 加深并出下划线
  &__link {
    position: absolute;
    left: 0;
    width: 305px;
    font-family: $font-serif;
    font-weight: $weight-normal;
    font-size: 13px;
    line-height: 1.4;
    text-align: center;
    text-decoration: none;
    color: $ink-soft;
    transition: color $transition-fast;

    &:hover {
      color: $ink;
      text-decoration: underline;
    }

    &:focus-visible {
      outline: none;
      color: $ink;
      text-decoration: underline;
    }
  }
}

// 小屏（<768px）：隐藏纸张装饰与角标；表单宽度取视口 86%，并受 46vh 高度约束
@media (max-width: 768px) {
  .reset-page {
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
