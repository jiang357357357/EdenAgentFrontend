import { useEffect, useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

type Profile = Awaited<ReturnType<typeof readProfiles>>[number]
const readProfiles = () => rpcRequestForOrigin('local', 'model.local.profiles.list', {})
export function LocalModelProfiles() {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [profiles, setProfiles] = useState<Profile[]>([]), [selected, setSelected] = useState<Profile | null>(null)
  const [provider, setProvider] = useState(''), [modelId, setModelId] = useState(''), [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState(''), [contextWindow, setContextWindow] = useState(32768), [maxTokens, setMaxTokens] = useState(4096)
  const [confirm, setConfirm] = useState(false), [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState('')
  useEffect(() => {
    let active = true
    if (origin === 'local') void readProfiles().then(value => { if (active) setProfiles(value) }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [origin])
  function edit(profile: Profile | null) {
    setSelected(profile); setProvider(profile?.model.provider ?? ''); setModelId(profile?.model.id ?? '')
    setBaseUrl(profile?.model.baseUrl ?? ''); setContextWindow(profile?.model.contextWindow ?? 32768); setMaxTokens(profile?.model.maxTokens ?? 4096)
    setApiKey(''); setConfirm(false); setConfirmRemove(false); setResult(''); setError('')
  }
  async function save() {
    if (!confirm) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin('local', 'model.local.profiles.save', { model: { ...(selected?.model ?? {}), provider, id: modelId, baseUrl,
        contextWindow, maxTokens, ...(apiKey ? { apiKey } : {}) }, expectedRevision: selected?.revision ?? null, confirmConfiguration: true })
      setApiKey(''); setConfirm(false); setProfiles(await readProfiles()); setSelected(null); setResult('配置已保存。任务角色填写完整 provider/model 后，新子任务会使用此独立配置。')
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function remove() {
    if (!selected || !confirmRemove) return
    setBusy(true); setError('')
    try { await rpcRequestForOrigin('local', 'model.local.profiles.remove', { key: selected.key, expectedRevision: selected.revision, confirmRemoval: true }); edit(null); setProfiles(await readProfiles()) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  if (origin !== 'local') return null
  return <details className="my-2 rounded border p-2 text-xs"><summary>子任务独立模型配置</summary>
    <p>仅存于尘世。修改或删除目录项不改变已创建任务的独立模型快照；既有任务须停止后另行处理。</p>
    <select aria-label="独立模型配置" disabled={busy} value={selected?.key ?? ''} onChange={event => edit(profiles.find(item => item.key === event.target.value) ?? null)}>
      <option value="">新增配置</option>{profiles.map(item => <option key={item.key} value={item.key}>{item.key} · {item.hasCredential ? '已存凭据' : '无凭据'}</option>)}
    </select>
    <fieldset disabled={busy} onChange={() => setConfirm(false)} className="space-y-1">
      <label className="block">供应商<input value={provider} disabled={Boolean(selected)} onChange={event => setProvider(event.target.value)} /></label>
      <label className="block">模型 ID<input value={modelId} disabled={Boolean(selected)} onChange={event => setModelId(event.target.value)} /></label>
      <label className="block">服务地址<input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} /></label>
      <label className="block">API Key<input type="password" autoComplete="new-password" value={apiKey} onChange={event => setApiKey(event.target.value)} /></label>
      <p>凭据不回显。保存时重新填写；留空表示该配置不使用凭据。</p>
      <label className="block">上下文容量<input type="number" min={1} value={contextWindow} onChange={event => setContextWindow(Number(event.target.value))} /></label>
      <label className="block">最大输出<input type="number" min={1} value={maxTokens} onChange={event => setMaxTokens(Number(event.target.value))} /></label>
    </fieldset>
    <label className="block"><input type="checkbox" disabled={busy} checked={confirm} onChange={event => setConfirm(event.target.checked)} /> 确认将此配置用于后续子任务。</label>
    <button disabled={busy || !confirm || !provider || !modelId || !baseUrl} onClick={() => void save()}>保存配置</button>
    {selected && <><label className="block"><input type="checkbox" disabled={busy} checked={confirmRemove} onChange={event => setConfirmRemove(event.target.checked)} /> 确认从目录删除此配置。</label>
      <button disabled={busy || !confirmRemove} onClick={() => void remove()}>删除目录项</button></>}
    {result && <p role="status">{result}</p>}{error && <p role="alert">{error}</p>}
  </details>
}
