import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'

export function useCurrentUser() {
  const account = useUserStore()
  const { user } = storeToRefs(account)
  const loading = ref(false)
  const error = ref('')
  async function fetchUser(): Promise<void> {
    if (user.value || loading.value) return
    loading.value = true
    try { await account.fetchMe(); error.value = '' }
    catch { error.value = '用户信息获取失败' }
    finally { loading.value = false }
  }
  return { user, loading, error, fetchUser }
}
