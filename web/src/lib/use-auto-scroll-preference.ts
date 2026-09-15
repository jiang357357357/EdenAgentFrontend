import { useEffect, useRef, useState } from 'react'
import { rpcRequestForOrigin } from './rpc-transport'
import { getRuntimeOriginRevision } from './runtime-origin'

type Origin = 'mon' | 'local'
export function useAutoScrollPreference(origin: Origin | null, active: boolean) {
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const owner = useRef<{ origin: Origin; revision: number; live: boolean; busy: boolean } | null>(null)
  useEffect(() => {
    setReady(false); setEnabled(false); setError(undefined)
    if (!origin || !active) return
    const scope = { origin, revision: getRuntimeOriginRevision(), live: true, busy: false }
    owner.current = scope
    void rpcRequestForOrigin(origin, 'ui.preferences.get', {}, scope.revision).then(value => {
      if (scope.live) { setEnabled(value.autoScrollEnabled); setReady(true) }
    }).catch(reason => { if (scope.live) setError(`读取滚动偏好失败：${String(reason)}`) })
    return () => { scope.live = false }
  }, [origin, active])
  const change = (value: boolean) => {
    const scope = owner.current
    if (!ready || !scope?.live || scope.busy) return
    scope.busy = true; setReady(false); setError(undefined)
    void rpcRequestForOrigin(scope.origin, 'ui.preferences.update', { autoScrollEnabled: value }, scope.revision).then(result => {
      if (scope.live) setEnabled(result.autoScrollEnabled)
    }).catch(reason => { if (scope.live) setError(`保存滚动偏好失败：${String(reason)}`) })
      .finally(() => { scope.busy = false; if (scope.live) setReady(true) })
  }
  return { enabled, ready, error, change }
}
