import { useCallback, useEffect, useState } from 'react'
import { getWorkspaceIdentity } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
import { initialWorkbench, restoreWorkbench, workbenchReducer, type WorkbenchAction } from './workbench-state'

export function useWorkbench(account: string) {
  const origin = getStoredRuntimeOrigin() ?? 'mon'
  const identity = `${origin}:${account}`
  const [scope, setScope] = useState<{ identity: string; key: string }>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [saved, setSaved] = useState(() => ({ key: '', state: initialWorkbench() }))
  useEffect(() => {
    let active = true
    setError('')
    void getWorkspaceIdentity(origin).then(workspace => {
      if (!active) return
      const key = `eden.workbench:${JSON.stringify([1, origin, workspace, account])}`
      let raw: string | null = null
      try { raw = localStorage.getItem(key) } catch { setError('浏览器未允许保存布局，本次布局仍可使用。') }
      setSaved({ key, state: restoreWorkbench(raw) }); setScope({ identity, key })
    }).catch(reason => { if (active) setError(`工作台连接失败：${String(reason)}`) })
    return () => { active = false }
  }, [identity, origin, account, attempt])
  const ready = scope?.identity === identity && saved.key === scope.key
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      try { localStorage.setItem(saved.key, JSON.stringify(saved.state)) }
      catch { setError('布局保存失败，请检查本机存储空间。') }
    }, 150)
    return () => clearTimeout(timer)
  }, [saved, ready])
  const dispatch = useCallback((action: WorkbenchAction) => {
    if (scope?.identity !== identity) return
    setSaved(current => current.key === scope.key ? { ...current, state: workbenchReducer(current.state, action) } : current)
  }, [scope, identity])
  return { state: saved.state, dispatch, ready, storageKey: saved.key, error, retry: () => setAttempt(value => value + 1) }
}
