<script setup lang="ts">
/**
 * @component CompatCheck
 * @description DOCX 应用级兼容性验收（API.md 附录 A.5）。
 *
 * 为什么不是自动加载：这个接口需要服务端做**真实排版**，耗时明显长于其他接口，
 * 所以做成「点一次跑一次」，避免每次打开预览都触发。
 *
 * 结果语义：
 *   - `compatible` 只由 ERROR 级问题决定，WARNING 不影响通过；
 *   - `missingFonts` 非空通常意味着服务端缺少字体，版面会与预期不同；
 *   - 未接入排版后端时后端返回 503，需要当作"服务端没配好"提示，而不是文档有问题。
 */
import { ref } from 'vue'
import { previewApi } from '@/api/preview'
import { ApiError } from '@/api/http'
import type { CompatibilityReport } from '@/api/types'

const props = defineProps<{
  /** 文件 ID */
  fileId: number
  /** 明确版本号 */
  versionNo: number
}>()

/** 验收报告；null 表示尚未运行 */
const report = ref<CompatibilityReport | null>(null)
/** 运行中 */
const loading = ref(false)
/** 失败提示 */
const error = ref('')

/** 执行验收 */
async function run(): Promise<void> {
  loading.value = true
  error.value = ''
  report.value = null
  try {
    report.value = await previewApi.compatibilityCheck(props.fileId, props.versionNo)
  } catch (e) {
    // 400：非 DOCX；503：服务端未接入排版后端；422：文档本身无法渲染
    error.value = e instanceof ApiError ? e.message : '兼容性检查失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="compat">
    <p class="compat__hint">
      检查当前版本的缺失字体与排版问题。<strong>需要服务端做真实排版，耗时较长</strong>，因此按需运行。
    </p>

    <button class="compat__run" type="button" :disabled="loading" @click="run">
      {{ loading ? '检查中…' : report ? '重新检查' : '开始检查' }}
    </button>

    <p v-if="error" class="compat__hint" role="alert">{{ error }}</p>

    <template v-if="report">
      <p class="compat__verdict" :class="report.compatible ? 'compat__verdict--ok' : 'compat__verdict--bad'">
        {{ report.compatible ? '通过' : '未通过' }}
        <span class="compat__meta">
          引擎 {{ report.engine ?? '未知' }} · 共 {{ report.pageCount }} 页，已渲染 {{ report.renderedPages }} 页
        </span>
      </p>

      <div v-if="report.missingFonts.length" class="compat__block">
        <p class="compat__block-title">缺失字体（{{ report.missingFonts.length }}）</p>
        <ul class="compat__list">
          <li v-for="font in report.missingFonts" :key="font">{{ font }}</li>
        </ul>
      </div>

      <div v-if="report.issues.length" class="compat__block">
        <p class="compat__block-title">检查项（{{ report.issues.length }}）</p>
        <ul class="compat__list">
          <li v-for="(issue, index) in report.issues" :key="`${issue.code}-${index}`">
            <span
              class="compat__severity"
              :class="issue.severity === 'ERROR' ? 'compat__severity--error' : 'compat__severity--warn'"
            >
              {{ issue.severity === 'ERROR' ? '错误' : '警告' }}
            </span>
            <span class="compat__code">{{ issue.code }}</span>
            <span class="compat__msg">{{ issue.message }}</span>
          </li>
        </ul>
      </div>

      <p v-if="!report.missingFonts.length && !report.issues.length" class="compat__hint">
        未发现缺失字体或排版问题。
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.compat {
  display: flex;
  flex-direction: column;
  gap: $gap-sm;
  min-height: 0;
  overflow-y: auto;
}

.compat__hint {
  margin: 0;
  font-size: $font-size-body;
  color: $ink-soft;
}

.compat__run {
  align-self: flex-start;
  min-width: 96px;
  height: $control-height;
  padding: 0 $card-padding;
  font: inherit;
  font-size: $font-size-body;
  color: $ink;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: $ink-soft;
  }

  &:disabled {
    opacity: $disabled-opacity;
    cursor: default;
  }
}

/* 通过/未通过用字重和颜色区分，不用大色块，保持墨色体系 */
.compat__verdict {
  margin: 0;
  font-size: $font-size-title;
  font-weight: $weight-semibold;
}

.compat__verdict--ok {
  color: $accent;
}

.compat__verdict--bad {
  color: $ink;
}

.compat__meta {
  margin-left: $gap-sm;
  font-size: $font-size-caption;
  font-weight: $weight-normal;
  color: $ink-soft;
}

.compat__block {
  padding: $gap-sm;
  background-color: $paper-surface;
  border: $border-w solid $line;
  border-radius: $radius;
}

.compat__block-title {
  margin: 0 0 $gap-xs;
  font-size: $font-size-caption;
  font-weight: $weight-medium;
  color: $ink;
}

.compat__list {
  margin: 0;
  padding-left: $gap-sm;
  font-size: $font-size-body;
  color: $ink;

  li {
    margin-bottom: $gap-xs;
  }
}

.compat__severity {
  display: inline-block;
  min-width: 32px;
  margin-right: $gap-xs;
  font-size: $font-size-caption;
  font-weight: $weight-medium;
}

.compat__severity--error {
  color: $ink;
}

.compat__severity--warn {
  color: $ink-soft;
}

.compat__code {
  margin-right: $gap-xs;
  font-size: $font-size-caption;
  color: $ink-soft;
}

.compat__msg {
  font-size: $font-size-body;
}
</style>
