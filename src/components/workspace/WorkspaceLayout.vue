<script setup lang="ts">
/**
 * @component WorkspaceLayout
 * @description 工作台外层布局外壳：左侧纵向侧边栏（文件列表 / 任务列表 / 任务详情
 *              三个分区从上到下排列）+ 右侧主内容区，中间为可拖拽分隔条。
 *              每个分区自带可点击的标题栏，支持展开 / 收起：收起后只保留标题条，
 *              展开的分区按配比瓜分剩余高度。
 *              四个区域均以具名插槽（files / tasks / detail / main）暴露，
 *              业务组件由 WorkspaceView 填充，本组件只关心布局、折叠与拖拽交互。
 */
import { reactive, ref } from 'vue'

/** 侧边栏分区标识：左上文件列表 / 左中任务列表 / 左下任务详情 */
type ZoneKey = 'files' | 'tasks' | 'detail'

/** 各分区展开状态：默认全部展开 */
const zonesOpen = reactive<Record<ZoneKey, boolean>>({
  files: true,
  tasks: true,
  detail: true,
})

/**
 * 切换分区展开 / 收起状态
 * @param zone 分区标识
 */
function toggleZone(zone: ZoneKey): void {
  zonesOpen[zone] = !zonesOpen[zone]
}

/** 侧边栏当前宽度（px），拖拽分隔条时实时更新 */
const sidebarWidth = ref(320)

/** 是否正在拖拽分隔条：拖拽期间给根节点加禁选中样式，避免划选文字 */
const isDragging = ref(false)

/** 布局容器根元素，用于拖拽时计算指针相对容器左缘的偏移 */
const layoutRef = ref<HTMLElement | null>(null)

/** 侧边栏宽度下限，低于该值文件名等信息不可读（与 variables.scss 登记值一致） */
const SIDEBAR_MIN_WIDTH = 260
/** 侧边栏宽度上限，超过后主内容区过窄，影响预览阅读 */
const SIDEBAR_MAX_WIDTH = 480

/**
 * 开始拖拽分隔条
 * 通过 setPointerCapture 锁定指针，保证鼠标移出分隔条区域时仍能持续追踪移动。
 * @param event 指针按下事件
 */
function onResizeStart(event: PointerEvent): void {
  isDragging.value = true
  // 对分隔条元素锁定指针：后续 pointermove / pointerup 即使在元素外触发也会派发给它
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

/**
 * 拖拽中：依据指针横坐标计算新的侧边栏宽度，并夹紧到允许区间
 * @param event 指针移动事件
 */
function onResizeMove(event: PointerEvent): void {
  // 未处于拖拽状态时忽略 move（如鼠标只是划过分隔条）
  if (!isDragging.value) {
    return
  }
  const layoutLeft = layoutRef.value?.getBoundingClientRect().left ?? 0
  // 指针相对容器左缘的距离即为侧边栏目标宽度
  const nextWidth = event.clientX - layoutLeft
  // 夹紧到 [最小宽度, 最大宽度]，防止把面板拖没或把主区域挤没
  sidebarWidth.value = Math.min(Math.max(nextWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH)
}

/** 拖拽结束（松开鼠标或系统中断指针）：退出拖拽状态 */
function onResizeEnd(): void {
  isDragging.value = false
}
</script>

<template>
  <div
    ref="layoutRef"
    class="workspace-layout"
    :class="{ 'workspace-layout--dragging': isDragging }"
  >
    <!-- 左侧纵向侧边栏：宽度可拖拽调整，三个分区从上到下排列 -->
    <aside
      class="workspace-layout__sidebar"
      :style="{ width: `${sidebarWidth}px` }"
    >
      <!-- 侧边栏顶部：全局搜索区（同时过滤文件与任务，内容由父组件通过插槽注入） -->
      <div class="workspace-layout__sidebar-search">
        <slot name="search" />
      </div>

      <!-- 左上：文件列表（标题栏可点击折叠） -->
      <section
        class="workspace-layout__zone workspace-layout__zone--files"
        :class="{ 'workspace-layout__zone--collapsed': !zonesOpen.files }"
      >
        <button
          type="button"
          class="workspace-layout__zone-header"
          :aria-expanded="zonesOpen.files"
          @click="toggleZone('files')"
        >
          <span class="workspace-layout__zone-title">文件列表</span>
          <svg
            class="workspace-layout__zone-chevron"
            :class="{ 'workspace-layout__zone-chevron--open': zonesOpen.files }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <!-- v-show 折叠时保留组件挂载状态，切回时无需重新拉取数据 -->
        <div v-show="zonesOpen.files" class="workspace-layout__zone-body">
          <slot name="files" />
        </div>
      </section>

      <!-- 左中：任务列表（标题栏可点击折叠） -->
      <section
        class="workspace-layout__zone workspace-layout__zone--tasks"
        :class="{ 'workspace-layout__zone--collapsed': !zonesOpen.tasks }"
      >
        <button
          type="button"
          class="workspace-layout__zone-header"
          :aria-expanded="zonesOpen.tasks"
          @click="toggleZone('tasks')"
        >
          <span class="workspace-layout__zone-title">任务列表</span>
          <svg
            class="workspace-layout__zone-chevron"
            :class="{ 'workspace-layout__zone-chevron--open': zonesOpen.tasks }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div v-show="zonesOpen.tasks" class="workspace-layout__zone-body">
          <slot name="tasks" />
        </div>
      </section>

      <!-- 左下：任务详情（标题栏可点击折叠） -->
      <section
        class="workspace-layout__zone workspace-layout__zone--detail"
        :class="{ 'workspace-layout__zone--collapsed': !zonesOpen.detail }"
      >
        <button
          type="button"
          class="workspace-layout__zone-header"
          :aria-expanded="zonesOpen.detail"
          @click="toggleZone('detail')"
        >
          <span class="workspace-layout__zone-title">任务详情</span>
          <svg
            class="workspace-layout__zone-chevron"
            :class="{ 'workspace-layout__zone-chevron--open': zonesOpen.detail }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div v-show="zonesOpen.detail" class="workspace-layout__zone-body">
          <slot name="detail" />
        </div>
      </section>
    </aside>

    <!-- 左右分隔条：hover 提示可拖拽，拖拽调整侧边栏宽度 -->
    <div
      class="workspace-layout__resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="拖拽调整侧边栏宽度"
      @pointerdown="onResizeStart"
      @pointermove="onResizeMove"
      @pointerup="onResizeEnd"
      @pointercancel="onResizeEnd"
    />

    <!-- 右侧主内容区：上传/指令输入 或 文稿预览两种状态由插槽内容决定 -->
    <main class="workspace-layout__main">
      <slot name="main" />
    </main>
  </div>
</template>

<style scoped lang="scss">
.workspace-layout {
  display: flex;
  height: 100%;

  // 拖拽期间全局禁止划选文字，指针统一为列调整形态
  &--dragging {
    cursor: col-resize;
    user-select: none;
  }
}

.workspace-layout__sidebar {
  display: flex;
  flex-direction: column;
  // 宽度由内联样式控制，flex-shrink: 0 防止被主区域挤压
  flex-shrink: 0;
  overflow: hidden;
  // 侧边栏用卡片面亮度，与右侧页面底色形成层次
  background-color: $paper-surface;
  border-right: $border-w solid $line;
}

// 侧边栏顶部全局搜索区：固定高度不参与分区伸缩
.workspace-layout__sidebar-search {
  flex-shrink: 0;
  padding: $gap-sm $input-padding-x;
  border-bottom: $border-w solid $line;
}

.workspace-layout__zone {
  display: flex;
  flex-direction: column;
  // min-height: 0 允许 flex 子项收缩，超出部分交给内部滚动而不是撑破布局
  min-height: 0;

  // 三个展开分区的配比：文件列表略高，任务列表与详情均衡
  &--files {
    flex: 5;
    border-bottom: $border-w solid $line;
  }

  &--tasks {
    flex: 4;
    border-bottom: $border-w solid $line;
  }

  &--detail {
    flex: 4;
  }

  // 收起后只保留标题条，不再参与高度分配
  &--collapsed {
    flex: 0 0 auto;
  }
}

.workspace-layout__zone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: $control-height;
  padding: 0 $input-padding-x;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background-color $transition-fast;

  // hover 淡淡浮起一档，提示整行可点击
  &:hover {
    background-color: $paper-base;
  }
}

.workspace-layout__zone-title {
  font-size: $font-size-body;
  font-weight: $weight-medium;
  color: $ink;
}

.workspace-layout__zone-chevron {
  width: 14px; // 标题栏箭头结构尺寸
  height: 14px;
  color: $ink-soft;
  // 收起时箭头转向右侧，展开时朝下
  transform: rotate(-90deg);
  transition: transform $transition-fast;

  &--open {
    transform: rotate(0deg);
  }
}

.workspace-layout__zone-body {
  // 占满标题条以下空间，内部超出自行滚动
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.workspace-layout__resizer {
  // 命中区域略宽于视觉线条，降低拖拽瞄准难度
  width: $resizer-size;
  flex-shrink: 0;
  cursor: col-resize;
  touch-action: none;
  transition: background-color $transition-fast;

  // hover 时显形，提示此处可拖拽
  &:hover {
    background-color: $line;
  }
}

.workspace-layout__main {
  flex: 1;
  // min-width: 0 防止预览内容过宽时把主区域撑破
  min-width: 0;
  overflow-y: auto;
}
@media (max-width: 768px) {
  .workspace-layout { flex-direction: column; height: auto; min-height: 100dvh; }
  .workspace-layout__sidebar { width: 100% !important; max-height: 42dvh; min-height: 220px; border-right: 0; border-bottom: 1px solid $line; }
  .workspace-layout__resizer { display: none; }
  .workspace-layout__main { min-height: 58dvh; overflow: visible; }
}
</style>
