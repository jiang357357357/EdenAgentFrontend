import { getStoredToken } from './auth'
import { getRuntimeOriginRevision, getStoredRuntimeOrigin, RUNTIME_ORIGIN_STORAGE_KEY } from './runtime-origin'

let generation = 0
let pending = new Map<string, Promise<unknown>>()

function invalidate() { generation++; pending = new Map() }
if (typeof window !== 'undefined') {
  window.addEventListener('edenagent:account-changed', invalidate)
  window.addEventListener('edenagent:runtime-origin-changed', invalidate)
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === 'agent.auth_token' || event.key === RUNTIME_ORIGIN_STORAGE_KEY) invalidate()
  })
}

/** Share in-flight snapshots only; completed results never become a stale history cache. */
export function coalesceSessionSnapshot<T>(key: string, read: () => Promise<T>): Promise<T> {
  const origin = getStoredRuntimeOrigin(), revision = getRuntimeOriginRevision(), token = getStoredToken()
  const epoch = generation, operations = pending
  const scopedKey = JSON.stringify([origin, revision, token, key])
  const existing = operations.get(scopedKey)
  if (existing) return existing as Promise<T>
  const assertCurrent = () => {
    if (generation !== epoch || getStoredRuntimeOrigin() !== origin || getRuntimeOriginRevision() !== revision || getStoredToken() !== token)
      throw new Error('账号或世界已切换，请重新读取会话')
  }
  const task = Promise.resolve().then(() => { assertCurrent(); return read() }).then(result => {
    assertCurrent()
    return result
  }).finally(() => {
    if (operations.get(scopedKey) === task) operations.delete(scopedKey)
  })
  operations.set(scopedKey, task)
  return task
}
