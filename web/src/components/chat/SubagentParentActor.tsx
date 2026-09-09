import { useEffect, useState } from 'react'
import { actorIdSchema } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function SubagentParentActor({ sessionId, value, disabled, onChange }: {
  sessionId: string; value: string; disabled: boolean; onChange: (value: string) => void
}) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [actors, setActors] = useState<{ id: string; label: string }[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void rpcRequestForOrigin(origin, 'session.read', { sessionId }).then(session => {
      if (!active) return
      setActors(session.participants.flatMap(participant => {
        if (!participant || typeof participant !== 'object' || Array.isArray(participant)) return []
        const parsed = actorIdSchema.safeParse(participant.assistantId)
        return parsed.success ? [{ id: String(parsed.data), label: typeof participant.name === 'string' ? participant.name : String(parsed.data) }] : []
      }))
    }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [sessionId, origin])
  return <div className="mt-2">
    {actors.length > 0 && <label>父会话角色 <select aria-label="子任务模型来源角色" disabled={disabled} value={value} onChange={event => onChange(event.target.value)} className="rounded border p-1">
      <option value="">{actors.length > 1 ? '请选择模型来源角色' : '继承父会话模型'}</option>
      {actors.map(actor => <option key={actor.id} value={actor.id}>{actor.label}</option>)}
    </select></label>}
    {actors.length > 1 && <p>子任务使用选中角色的模型和视觉绑定，只保留该角色作为参与者。</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
