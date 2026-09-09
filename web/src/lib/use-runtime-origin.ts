import { useSyncExternalStore } from 'react'
import { getStoredRuntimeOrigin, RUNTIME_ORIGIN_STORAGE_KEY } from './runtime-origin'

function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === RUNTIME_ORIGIN_STORAGE_KEY) listener() }
  window.addEventListener('edenagent:runtime-origin-changed', listener)
  window.addEventListener('storage', storage)
  return () => { window.removeEventListener('edenagent:runtime-origin-changed', listener); window.removeEventListener('storage', storage) }
}
export function useRuntimeOrigin() {
  return useSyncExternalStore(subscribe, () => getStoredRuntimeOrigin() ?? 'mon', () => 'mon' as const)
}
