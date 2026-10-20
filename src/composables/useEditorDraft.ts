import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'

const guards = new Set<() => boolean>()
const busyGuards = new Set<() => boolean>()
const approvals = new Set<() => void>()
let pending: Promise<boolean> | null = null
export async function confirmLeaveDrafts(): Promise<boolean> {
  if ([...busyGuards].some(guard => guard())) {
    ElMessage.warning('正在处理当前操作，请等待完成后再切换')
    return false
  }
  if (![...guards].some(guard => guard())) return true
  if (!pending) pending = ElMessageBox.confirm('有尚未提交的修改。系统会尝试在当前标签页保留草稿；如编辑区提示存储不可用，请先返回提交。草稿不会自动提交到文件。', '保留草稿并继续？', {
    confirmButtonText: '保留草稿并继续', cancelButtonText: '继续编辑', type: 'warning',
  }).then(() => { approvals.forEach(approve => approve()); return true }, () => false).finally(() => { pending = null })
  return pending
}

/** Register operations that must finish before another document is opened. */
export function useNavigationBusy(isBusy: () => boolean): void {
  busyGuards.add(isBusy)
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (isBusy()) { event.preventDefault(); event.returnValue = '' }
  }
  window.addEventListener('beforeunload', beforeUnload)
  onScopeDispose(() => { busyGuards.delete(isBusy); window.removeEventListener('beforeunload', beforeUnload) })
}

export interface EditorDraftOptions<T> {
  name: string
  context: () => string
  enabled: () => boolean
  busy?: () => boolean
  read: () => T
  apply: (value: T) => void
}
/** Exact account/file/version isolation; only JSON drafts are stored in this tab. */
export function useEditorDraft<T>(options: EditorDraftOptions<T>) {
  const account = useUserStore()
  const ready = ref(false)
  const baseline = ref('')
  const available = ref(false)
  const storageError = ref('')
  let activeKey = ''
  let approved = ''
  let generation = 0
  const snapshot = computed(() => JSON.stringify(options.read()))
  const dirty = computed(() => ready.value && options.enabled() && snapshot.value !== baseline.value)
  const key = () => account.user?.id == null ? '' : `wenshu.draft.v1:${account.user.id}:${options.name}:${options.context()}`
  function remove(): void {
    try { if (activeKey) sessionStorage.removeItem(activeKey); available.value = false }
    catch { storageError.value = '浏览器未允许删除草稿' }
  }
  function persist(): void {
    if (!ready.value || !options.enabled() || key() !== activeKey || !activeKey || !dirty.value) return
    try {
      sessionStorage.setItem(activeKey, JSON.stringify({ value: options.read(), updatedAt: Date.now() }))
      available.value = true; storageError.value = ''
    } catch { storageError.value = '浏览器草稿存储不可用，请先提交修改再离开' }
  }
  watch(() => [key(), options.enabled()], async () => {
    const request = ++generation
    ready.value = false
    await nextTick()
    if (request !== generation || !options.enabled()) return
    activeKey = key(); baseline.value = snapshot.value; approved = ''
    storageError.value = activeKey ? '' : '当前账号信息尚未就绪，暂时无法缓存草稿，请先提交再离开'
    try { available.value = !!activeKey && sessionStorage.getItem(activeKey) !== null }
    catch { storageError.value = '浏览器草稿存储不可用' }
    ready.value = true
  }, { immediate: true, flush: 'sync' })
  watch(snapshot, persist, { flush: 'sync' })
  function restore(): void {
    if (!ready.value || !activeKey) return
    try {
      const saved = sessionStorage.getItem(activeKey)
      if (saved) options.apply(JSON.parse(saved).value as T)
    } catch { storageError.value = '草稿无法读取，请删除后重新编辑' }
  }
  function saved(fields?: (keyof T)[]): void {
    if (fields?.length && baseline.value) {
      // Submitted groups are removed from the old-version draft. Keep other tabs' work.
      const previous = JSON.parse(baseline.value) as T
      const remaining = JSON.parse(snapshot.value) as T
      for (const field of fields) remaining[field] = previous[field]
      options.apply(remaining)
    } else baseline.value = snapshot.value
    approved = ''
    if (dirty.value) persist()
    else remove()
  }
  const warn = () => dirty.value && snapshot.value !== approved
  const approve = () => { persist(); approved = snapshot.value }
  const processing = () => !!options.busy?.()
  guards.add(warn); approvals.add(approve); busyGuards.add(processing)
  function beforeUnload(event: BeforeUnloadEvent): void {
    persist()
    if (warn() || processing()) { event.preventDefault(); event.returnValue = '' }
  }
  window.addEventListener('beforeunload', beforeUnload)
  onScopeDispose(() => {
    persist(); generation++; guards.delete(warn); approvals.delete(approve); busyGuards.delete(processing)
    window.removeEventListener('beforeunload', beforeUnload)
  })
  return { available, dirty, storageError, restore, remove, saved, persist, confirmClose: confirmLeaveDrafts }
}
