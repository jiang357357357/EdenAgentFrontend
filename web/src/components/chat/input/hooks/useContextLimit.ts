import { useCallback, useEffect, useRef, useState } from 'react'
import { useScopedRpc } from '../../../../lib/use-scoped-rpc'
import type { RpcMethodMap } from '../../../../lib/rpc-contracts'

export type ContextLimitInfo = RpcMethodMap['model.context.read']['result']

export function useContextLimit(sessionId: string | undefined, refreshKey: unknown, isRunning: boolean) {
  const rpc = useScopedRpc()
  const [info, setInfo] = useState<ContextLimitInfo>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const current = ++generation.current
    setLoading(true); setError('')
    if (!sessionId) { setInfo(undefined); setLoading(false); return }
    void rpc('model.context.read', { sessionId }).then(value => {
      if (generation.current === current) setInfo(value)
    }).catch(reason => {
      if (generation.current === current) { setInfo(undefined); setError(reason instanceof Error ? reason.message : '读取上下文设置失败。') }
    }).finally(() => { if (generation.current === current) setLoading(false) })
    return () => { generation.current++ }
  }, [sessionId, rpc, refreshKey, isRunning, revision])

  const save = async (limit: number | null) => {
    if (!sessionId || !info || saving) return false
    const current = generation.current
    setSaving(true); setError('')
    try {
      const result = await rpc('model.context.set', { sessionId, contextWindow: limit,
        expectedModelKey: info.modelKey, expectedRevision: info.revision })
      if (generation.current !== current) { reload(); return false }
      setInfo(result)
      return true
    } catch (reason) {
      if (generation.current === current) setError(reason instanceof Error ? reason.message : '保存上下文上限失败。')
      return false
    } finally { setSaving(false) }
  }
  return { info, loading, saving, error, reload, save }
}
