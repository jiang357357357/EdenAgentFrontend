export const RUNTIME_ORIGIN_STORAGE_KEY = "agent.runtime_origin"

export type RuntimeOrigin = "mon" | "local"
export const LOCAL_ASSISTANT_ID = -1

let runtimeOriginRevision = 0
let observedOrigin: RuntimeOrigin | null = null
if (typeof window !== 'undefined') {
  observedOrigin = getStoredRuntimeOrigin()
  window.addEventListener('edenagent:runtime-origin-changed', () => {
    const next = getStoredRuntimeOrigin()
    if ((next ?? 'mon') !== (observedOrigin ?? 'mon')) runtimeOriginRevision++
    observedOrigin = next
  })
  window.addEventListener('storage', event => {
    if (event.key !== null && event.key !== RUNTIME_ORIGIN_STORAGE_KEY) return
    // Storage events can arrive after another change; do not collapse away-and-back transitions.
    runtimeOriginRevision++
    observedOrigin = getStoredRuntimeOrigin()
  })
}
export function getRuntimeOriginRevision() { return runtimeOriginRevision }

export function isRuntimeOrigin(value: unknown): value is RuntimeOrigin {
  return value === "mon" || value === "local"
}

export function getStoredRuntimeOrigin(): RuntimeOrigin | null {
  const value = window.localStorage.getItem(RUNTIME_ORIGIN_STORAGE_KEY)
  return isRuntimeOrigin(value) ? value : null
}

export function saveRuntimeOrigin(origin: RuntimeOrigin) {
  window.localStorage.setItem(RUNTIME_ORIGIN_STORAGE_KEY, origin)
  document.documentElement.dataset.runtimeOrigin = origin
  window.dispatchEvent(new CustomEvent("edenagent:runtime-origin-changed", { detail: { origin } }))
}

export function clearRuntimeOrigin() {
  window.localStorage.removeItem(RUNTIME_ORIGIN_STORAGE_KEY)
  delete document.documentElement.dataset.runtimeOrigin
  window.dispatchEvent(new CustomEvent("edenagent:runtime-origin-changed", { detail: { origin: "mon" } }))
}
