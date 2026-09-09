import { useState } from 'react'
import { subagentRoleDefinitionSchema } from '@eden/api'
import { useScopedRpc } from '../../lib/use-scoped-rpc'
import { SubagentRoleImport } from './SubagentRoleImport'

export function SubagentRoleEditor({ role, onSaved }: { role: string; onSaved: () => Promise<void> }) {
  const rpcRequest = useScopedRpc()
  const [text, setText] = useState(''), [loaded, setLoaded] = useState<{ name: string; revision: string | null; workspaceRoot: string; scope: 'user' | 'project' } | null>(null)
  const [scope, setScope] = useState<'user' | 'project'>('user')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function load() {
    setBusy(true); setError('')
    try {
      const result = await rpcRequest('agent.roles.edit', { name: role, scope })
      const { source: _source, revision: _revision, workspaceRoot: _root, ...definition } = result.definition
      setText(JSON.stringify(definition, null, 2)); setLoaded({ name: definition.name, revision: result.expectedRevision, workspaceRoot: result.workspaceRoot, scope })
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function save() {
    if (!loaded) return
    setBusy(true); setError('')
    try {
      const definition = subagentRoleDefinitionSchema.parse(JSON.parse(text))
      const saved = await rpcRequest('agent.roles.save', { definition, expectedRevision: definition.name === loaded.name ? loaded.revision : null, scope: loaded.scope, expectedWorkspaceRoot: loaded.workspaceRoot })
      setLoaded({ ...loaded, name: saved.name, revision: saved.revision }); await onSaved()
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function remove() {
    if (!loaded?.revision) return
    setBusy(true); setError('')
    try {
      await rpcRequest('agent.roles.remove', { name: loaded.name, scope: loaded.scope, expectedWorkspaceRoot: loaded.workspaceRoot, expectedRevision: loaded.revision })
      setLoaded(null); setText(''); await onSaved()
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-3 rounded border p-2">
    <summary>自定义角色配置</summary>
    <SubagentRoleImport onSaved={onSaved} />
    <p className="mt-2">读取角色后可修改 JSON，改名可创建新角色。同名保存覆盖所选范围的角色配置，项目配置优先于用户配置，只影响新任务；已有任务保留创建时的策略与预算。</p>
    <p>allowedTools 为 null 表示不额外限制，为空数组表示禁用全部工具；deniedTools 始终排除。只读模式及父任务限制仍生效。skills 可填写已安装技能名，创建时固定指令快照；支持文件和代码工具仍需另行读取或审批。model 为 null 时沿用父任务，可填模型 ID 或同供应商 provider/model；reasoning 可填 off/minimal/low/medium/high/xhigh/max。供应商必须支持所选模型和推理等级，跨供应商需先重新绑定父模型。</p>
    <select aria-label="角色保存范围" disabled={busy} value={scope} onChange={event => { setScope(event.target.value as 'user' | 'project'); setLoaded(null) }} className="mt-2 rounded border p-1"><option value="user">当前世界用户配置</option><option value="project">当前项目配置</option></select>
    {loaded?.workspaceRoot && <p>保存项目：{loaded.workspaceRoot}</p>}
    <button disabled={busy} onClick={() => void load()} className="mt-2 rounded border px-2 py-1">读取所选角色</button>
    {loaded && <><textarea aria-label="角色 JSON 配置" disabled={busy} value={text} maxLength={100000} onChange={event => setText(event.target.value)} className="mt-2 h-64 w-full rounded border p-2 font-mono" />
      <button disabled={busy || !text.trim()} onClick={() => void save()} className="rounded border px-2 py-1">保存角色配置</button>
      {loaded.revision && <button disabled={busy} onClick={() => void remove()} className="ml-2 rounded border px-2 py-1 text-red-700">移除所选范围的 {loaded.name} 配置</button>}
      <p>移除项目覆盖后恢复用户或内置配置，已有任务快照保留。</p></>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
