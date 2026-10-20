import { onScopeDispose, watch } from 'vue'

/** Invalidate responses on context changes, disposal, or a newer request in the same channel. */
export function useRequestGuard(context: () => unknown) {
  let generation = 0
  let disposed = false
  const channels = new Map<string, number>()
  watch(context, () => { generation++; channels.clear() }, { flush: 'sync' })
  onScopeDispose(() => { disposed = true; generation++ })
  return (channel = 'default') => {
    const epoch = generation
    const request = (channels.get(channel) ?? 0) + 1
    channels.set(channel, request)
    return () => !disposed && epoch === generation && channels.get(channel) === request
  }
}
