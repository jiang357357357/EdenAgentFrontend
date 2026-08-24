export const RUNTIME_ORIGIN_STORAGE_KEY = "agent.runtime_origin"

export type RuntimeOrigin = "mon" | "local"
export const LOCAL_ASSISTANT_ID = -1

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
  window.dispatchEvent(new CustomEvent("monagent:runtime-origin-changed", { detail: { origin } }))
}

export function clearRuntimeOrigin() {
  window.localStorage.removeItem(RUNTIME_ORIGIN_STORAGE_KEY)
  delete document.documentElement.dataset.runtimeOrigin
}
