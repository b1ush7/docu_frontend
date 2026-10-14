<script setup lang="ts">
/**
 * @file 登录页
 * @description 登录页采用「装饰层」与「表单层」解耦的两层结构，避免舞台 cover
 *              缩放在非 16:10 屏幕上裁切顶部留白、把表单顶偏的问题：
 *
 *                1) 装饰层 decor-stage：固定 1280×800 设计舞台，cover 方式等比缩放
 *                   居中（等价 background-size:cover），内含右下三张 -22° 线稿纸；
 *                   超出视口部分由页面裁切，负责右下出血效果。
 *
 *                2) 英文角标（Welcome / Log In）：独立于装饰舞台，直接相对视口四角
 *                   用 vw/vh 比例定位，避免 cover 裁切导致角标贴顶或跑位。
 *
 *                3) 表单层 form-frame：不跟随装饰舞台定位，而是在视口中水平居中、
 *                   垂直中心置于 42.3% 高度处（设计稿表单内容中心 338.5/800，
 *                   即「视觉重心略偏上」）。内部坐标系固定为设计稿宽度 305，
 *                   再根据容器实际宽度等比缩放（scale），因此任意屏幕比例下
 *                   表单都不会偏左偏上，内部元素相对位置仍与设计稿完全一致。
 *
 *              设计稿表单元素（宽 305，水平居中于画布 x=488；下方 y 已扣除顶部
 *              87px 空白、换算为表单框内坐标）：
 *                · 品牌区（文枢 + 104px 圆标识）       y=0   高 215 → BrandTitle
 *                · 登录方式 Tab（20px）              y=227 高 45
 *                · 输入框 ① 305×37                  y=284
 *                · 输入框 ② 305×37                  y=348
 *                · 登录按钮 305×37                  y=412
 *                · 底部链接行（左 忘记密码？/ 右 还没有账号？注册） y=478
 *              三个框（输入框①/②、按钮）间净间距由设计稿的 54px 按视觉要求
 *              缩小 50% → 27px（常量 FIELD_GAP）。
 *              所有表单元素一律使用线稿墨色 #2B2B2B（黑线条 / 黑字体），
 *              不使用设计稿中的浅蓝占位色 #C7DDE5。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import PaperDoc from '@/components/illustration/PaperDoc.vue'
import BrandTitle from '@/components/login/BrandTitle.vue'
import LoginTabs from '@/components/login/LoginTabs.vue'
import PasswordLoginForm from '@/components/login/PasswordLoginForm.vue'
import CaptchaLoginForm from '@/components/login/CaptchaLoginForm.vue'
import { sendLoginCode } from '@/api/auth'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

/** 纸张版式（与 PaperDoc 的 variant 字面量保持一致） */
type SheetVariant = 'newspaper' | 'magazine' | 'manifest'

/** 当前登录方式（Step 4 起由 LoginTabs 切换；Step 7/8 据此渲染对应表单） */
type LoginMode = 'password' | 'code'
const loginMode = ref<LoginMode>('password')

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

/** 表单内部设计稿宽度（px）；所有子元素均按此坐标系编写 */
const FORM_DESIGN_WIDTH = 305
/**
 * 表单【坐标空间】总高，保持 Step 4 的 503 不变（保证表单整体缩放比、
 * 框尺寸、字间距与 Step 4 完全一致）。行距收紧后最下方元素结束于 y=449，
 * 底部 54px 为透明留白，不影响定位。
 */
const FORM_DESIGN_HEIGHT = 503

/** 表单框外层引用（用于测量实际渲染宽度） */
const formFrameEl = ref<HTMLDivElement | null>(null)
/** 表单内部等比缩放比 = 渲染宽度 / 设计宽度 */
const formScale = ref(1)

/** 英文角标元素引用（用于运行时对齐 Welcome 与 Log In） */
const welcomeEl = ref<HTMLSpanElement | null>(null)
const logInEl = ref<HTMLSpanElement | null>(null)
/** Welcome 的左边距（px）= Log In 右边界到视口右边界的距离，使两角标左右对称 */
const welcomeLeft = ref(0)

let resizeObserver: ResizeObserver | null = null
/** 监听角标宽度变化（字体切换 / 窗口 resize 都会改变字宽），保持左右对称 */
let cornerResizeObserver: ResizeObserver | null = null

/**
 * 计算 Welcome 的左边距，使其最左边界到视口左边界的距离
 * 等于 Log In 最右边界到视口右边界的距离（以 Log In 当前位置为基准）。
 * 用 getBoundingClientRect 实测字宽，字体切换后自动重新对齐。
 */
function alignCorners(): void {
  const logIn = logInEl.value
  if (!logIn) {
    return
  }
  const rect = logIn.getBoundingClientRect()
  const rightGap = window.innerWidth - rect.right
  welcomeLeft.value = Math.max(0, rightGap)
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

  // 角标对齐：初次 + 角标宽度变化 + 窗口 resize 都重新计算
  alignCorners()
  window.addEventListener('resize', alignCorners)
  if (welcomeEl.value && logInEl.value) {
    cornerResizeObserver = new ResizeObserver(alignCorners)
    cornerResizeObserver.observe(welcomeEl.value)
    cornerResizeObserver.observe(logInEl.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateStageScale)
  window.removeEventListener('resize', alignCorners)
  resizeObserver?.disconnect()
  cornerResizeObserver?.disconnect()
})

/* ------------------------------ 表单槽位 ------------------------------ */

/**
 * 输入框 ① 顶边距（设计稿像素）；两种登录表单均从此处开始纵向排布。
 * 表单内部三框（输入框①/②、按钮）高 37px、间距 27px，由各表单组件自行 flex 排版。
 */
const FIELD_1_TOP = 284

/** 底部链接行的顶边距（设计稿像素）：左「忘记密码？」/ 右「还没有账号？注册」 */
const BOTTOM_LINKS_TOP = 478

/** 登录请求进行中标志（密码 / 验证码模式共用） */
const submitting = ref(false)

/** 服务端返回的登录错误文案（显示在表单下方） */
const serverError = ref('')

/**
 * 密码登录提交（由 PasswordLoginForm 本地校验通过后触发）
 * @description 接入真实接口 /user/login（经 user store）；失败时把服务端
 *              message 显示在表单下方，loading 态由 submitting 驱动。
 */
async function handlePasswordSubmit(payload: { account: string; password: string }): Promise<void> {
  if (submitting.value) {
    return
  }
  submitting.value = true
  serverError.value = ''
  try {
    await userStore.loginWithPassword(payload.account, payload.password)
    await router.push('/')
  } catch (error) {
    serverError.value = error instanceof Error ? error.message : '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

/**
 * 验证码登录提交（由 CaptchaLoginForm 本地校验通过后触发）
 * @description 接入真实接口 /user/login/by-code（经 user store），配合 /user/login/code 发送验证码。
 */
async function handleCaptchaSubmit(payload: { phone: string; code: string }): Promise<void> {
  if (submitting.value) {
    return
  }
  submitting.value = true
  serverError.value = ''
  try {
    await userStore.loginWithCode(payload.phone, payload.code)
    await router.push('/')
  } catch (error) {
    serverError.value = error instanceof Error ? error.message : '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

/**
 * 发送短信验证码
 * @description 真实接口 POST /user/login/code；resolve 触发 CaptchaInput 进入倒计时，
 *              reject(Error) 的 message 由表单显示在手机号框下方。
 * @param phone 手机号（组件侧已完成格式校验）
 */
async function requestLoginCode(phone: string): Promise<unknown> {
  await sendLoginCode(phone)
  return null
}
</script>

<template>
  <main class="login-page">
    <!-- ============ 装饰层：1280×800 舞台，cover 缩放，右下出血 ============ -->
    <div
      class="login-page__decor-stage"
      :style="{
        width: `${STAGE_WIDTH}px`,
        height: `${STAGE_HEIGHT}px`,
        transform: `translate(-50%, -50%) scale(${stageScale})`,
      }"
      aria-hidden="true"
    >
      <!-- 三张倾斜线稿纸 -->
      <div class="login-page__decor">
        <div
          v-for="(sheet, index) in sheets"
          :key="sheet.id"
          class="login-page__sheet"
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

    <!-- 英文角标：左上 Welcome / 右上 Log In，独立于装饰舞台、相对视口四角定位，
         位置与字号均按设计稿比例（/1280、/800）换算为 vw/vh，两个词各自锚定
         文本框中心（9.336vw / 93.008vw），保证任意屏幕比例下分别贴住左右两角 -->
    <span
      ref="welcomeEl"
      class="login-page__corner login-page__corner--left"
      :style="{ left: `${welcomeLeft}px` }"
      aria-hidden="true"
    >Welcome</span>
    <span
      ref="logInEl"
      class="login-page__corner login-page__corner--right"
      aria-hidden="true"
    >Log In</span>

    <!-- ============ 表单层：视口居中、重心略偏上，内部按 305 设计稿缩放 ============ -->
    <div class="login-page__content">
      <div ref="formFrameEl" class="login-page__frame">
        <div
          class="login-page__canvas"
          :style="{
            width: `${FORM_DESIGN_WIDTH}px`,
            height: `${FORM_DESIGN_HEIGHT}px`,
            transform: `scale(${formScale})`,
          }"
        >
          <!-- 品牌区：文枢 + 圆形标识（Step 3） -->
          <BrandTitle />

          <!-- 登录方式切换：密码登录 / 验证码登录（Step 4） -->
          <LoginTabs v-model="loginMode" />

          <!-- 密码登录表单（Step 7）：账号 + 密码 + 登录按钮，内部 27px 间距自动排开 -->
          <div
            v-if="loginMode === 'password'"
            class="login-page__field login-page__field--form"
            :style="{ top: `${FIELD_1_TOP}px` }"
          >
            <PasswordLoginForm
              :loading="submitting"
              @submit="handlePasswordSubmit"
            />
          </div>

          <!-- 验证码登录表单（Step 8）：手机号 + 验证码 + 登录按钮 -->
          <div
            v-else
            class="login-page__field login-page__field--form"
            :style="{ top: `${FIELD_1_TOP}px` }"
          >
            <CaptchaLoginForm
              :loading="submitting"
              :request-code="requestLoginCode"
              @submit="handleCaptchaSubmit"
            />
          </div>

          <!-- 服务端返回的登录错误（显示在表单下方，不挤压布局） -->
          <span
            v-if="serverError"
            class="login-page__server-error"
            :style="{ top: `${FIELD_1_TOP + 3 * 37 + 2 * 27 + 8}px` }"
            role="alert"
          >{{ serverError }}</span>

          <!-- 底部链接行：左「忘记密码？」前往找回密码页 / 右「还没有账号？注册」 -->
          <div
            class="login-page__links"
            :style="{ top: `${BOTTOM_LINKS_TOP}px` }"
          >
            <RouterLink class="login-page__link" to="/reset-password">忘记密码？</RouterLink>
            <RouterLink class="login-page__link" to="/register">还没有账号？注册</RouterLink>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.login-page {
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
    // 英文角标与中文统一使用全站字体变量（$font-serif），不再单独用 Georgia
    font-family: $font-serif;
    font-size: 4.375vw;
    line-height: 10.547vw;
    color: $ink;
    white-space: nowrap;
    pointer-events: none;

    // Welcome：左对齐，left 由 JS 动态计算 = Log In 右边界到视口右边的距离，
    // 使 Welcome 左边界到视口左边的距离与 Log In 右边界到视口右边的距离相等
    // （以 Log In 的位置为基准，字体切换后自动重新对齐）。
    &--left {
      transform: none;
    }

    // Log In：保持原设计稿位置不变（中心锚点 93.008vw）
    &--right {
      left: 93.008vw;
      transform: translateX(-50%);
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

  // 表单框：宽度公式与 Step 4 完全一致（23.828vw，clamp 260~480，46vh 高度上限），
  // 高度固定按宽高比 305:503 自适应——因此整体缩放比、框尺寸、字间距均不随行距变化
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

  // 表单组件的定位包装层：305 宽，顶部由画布坐标决定；
  // 单框高度 37px，表单容器（--form）高度由内部内容撑开
  &__field {
    position: absolute;
    left: 0;
    width: 305px;
    height: 37px;

    // 表单容器高度由内部三框 + 间距撑开，不锁死 37px
    &--form {
      height: auto;
    }
  }

  // 服务端登录错误（显示在表单下方，不挤压布局）
  &__server-error {
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

  // 底部链接行：左「忘记密码？」/ 右「还没有账号？注册」，在 305 宽内两端对齐
  &__links {
    position: absolute;
    left: 0;
    width: 305px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  // 底部链接项：次级墨色，hover 加深并出下划线
  &__link {
    font-family: $font-serif;
    font-weight: $weight-normal;
    font-size: 13px;
    line-height: 1.4;
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
  .login-page {
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
