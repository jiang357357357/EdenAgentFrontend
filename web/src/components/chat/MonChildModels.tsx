import { useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

type Option = { key: string; entityId: string; label: string }
type Saved = { key: string; entityId: string; revision: string; current: boolean }
export function MonChildModels({ sessionId }: { sessionId: string }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [options, setOptions] = useState<Option[]>([]), [profiles, setProfiles] = useState<Saved[]>([])
  const [selected, setSelected] = useState(''), [confirm, setConfirm] = useState(false), [removeKey, setRemoveKey] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState('')
  async function load() {
    setBusy(true); setError(''); setConfirm(false); setRemoveKey('')
    try {
      const values = await Promise.allSettled([
        rpcRequestForOrigin('mon', 'model.mon.children.catalog', { sessionId }),
        rpcRequestForOrigin('mon', 'model.mon.children.list', { sessionId }),
      ])
      if (values[0].status === 'fulfilled') setOptions(values[0].value); else setError(String(values[0].reason))
      if (values[1].status === 'fulfilled') setProfiles(values[1].value); else setError(String(values[1].reason))
    } finally { setBusy(false) }
  }
  async function bind() {
    const option = options.find(item => item.entityId === selected)
    if (!option || !confirm) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin('mon', 'model.mon.children.bind', { sessionId, entityId: selected,
        expectedRevision: profiles.find(item => item.key === option.key)?.revision ?? null, confirmBinding: true })
      setConfirm(false); setProfiles(await rpcRequestForOrigin('mon', 'model.mon.children.list', { sessionId })); setResult(`已绑定 ${option.key}。任务角色填写该完整模型名称后生效。`)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function remove(profile: Saved) {
    if (removeKey !== profile.key) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin('mon', 'model.mon.children.remove', { sessionId, key: profile.key, expectedRevision: profile.revision, confirmRemoval: true })
      setRemoveKey(''); setProfiles(await rpcRequestForOrigin('mon', 'model.mon.children.list', { sessionId }))
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  if (origin !== 'mon') return null
  return <details className="my-2 rounded border p-2"><summary>子任务独立 Mon 模型</summary>
    <p>使用当前父会话已验证的 Core 连接。仅保存本会话的子任务配置，不修改 Core 角色默认模型。先停止父会话执行，再读取目录或绑定。</p>
    <button disabled={busy} onClick={() => void load()}>读取可用模型与已绑定配置</button>
    <select aria-label="子任务独立 Mon 模型实体" disabled={busy} value={selected} onChange={event => { setSelected(event.target.value); setConfirm(false) }}>
      <option value="">选择实体</option>{options.map(item => <option key={item.entityId} value={item.entityId}>{item.label} · {item.key} · {item.entityId}</option>)}
    </select>
    <label className="block"><input type="checkbox" disabled={busy} checked={confirm} onChange={event => setConfirm(event.target.checked)} /> 确认将此实体绑定到后续子任务。</label>
    <button disabled={busy || !selected || !confirm} onClick={() => void bind()}>绑定独立模型</button>
    {profiles.map(profile => <div key={profile.key} className="mt-1 border-t"><p>{profile.key} · 实体 {profile.entityId} · {profile.current ? '当前连接' : '连接已变更，需重新绑定'}</p>
      <label><input type="checkbox" disabled={busy} checked={removeKey === profile.key} onChange={event => setRemoveKey(event.target.checked ? profile.key : '')} /> 确认移除目录绑定</label>
      <button disabled={busy || removeKey !== profile.key} onClick={() => void remove(profile)}>移除</button></div>)}
    <p>已有任务保留独立快照；更新或移除目录绑定不撤销已有任务的配置。</p>
    {result && <p role="status">{result}</p>}{error && <p role="alert">{error}</p>}
  </details>
}
