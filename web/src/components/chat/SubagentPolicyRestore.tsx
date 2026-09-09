import { useState } from 'react'
import { subagentPolicyRecoverySchema } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function SubagentPolicyRestore({ agentId, onSaved }: { agentId: string; onSaved: () => Promise<void> }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [role, setRole] = useState(''), [text, setText] = useState(''), [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [basis, setBasis] = useState<{ sourceHash: string; workspaceRoot: string; revision: string | null; definition: string } | null>(null)
  async function load() {
    setBusy(true); setError(''); setBasis(null); setConfirmed(false)
    try {
      const report = await rpcRequestForOrigin(origin, 'agent.recovery.read', { agentId })
      const roles = await rpcRequestForOrigin(origin, 'agent.roles', {})
      const selected = roles.find(value => value.name === role)
      if (!selected) throw new Error('请先输入已有角色名称；需要自定义时先在角色编辑器保存。')
      if (!report.workspaceRoot || !report.historicalConfigurationHash) throw new Error('须先恢复工作区并确认历史配置来源。')
      setBasis({ sourceHash: report.historicalConfigurationHash, workspaceRoot: report.workspaceRoot,
        revision: selected.revision, definition: JSON.stringify(selected, null, 2) })
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  async function save() {
    if (!basis || !confirmed) return
    setBusy(true); setError('')
    try {
      const input = subagentPolicyRecoverySchema.parse({ agentId, sourceHash: basis.sourceHash, workspaceRoot: basis.workspaceRoot,
        role, expectedRoleRevision: basis.revision, historicalPolicy: JSON.parse(text), note, confirmHistoricalRestrictions: true })
      await rpcRequestForOrigin(origin, 'agent.recovery.policy', input)
      await onSaved(); setBasis(null); setConfirmed(false)
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>恢复已核对的历史工具限制</summary>
    <p>先核对旧任务配置，使用新工具名称明确列出允许及拒绝名单。未知名称须完成映射，不能删掉旧拒绝项。服务端按你确认的映射收窄当前角色及父任务策略。</p>
    <input aria-label="恢复使用的角色" disabled={busy} value={role} onChange={event => { setRole(event.target.value); setBasis(null); setConfirmed(false) }} placeholder="已保存的角色名称" className="mt-2 w-full rounded border p-2" />
    <button disabled={busy || !role} onClick={() => void load()} className="my-2 rounded border px-2 py-1">读取角色与恢复依据</button>
    {basis && <><p className="break-all">工作区：{basis.workspaceRoot} · 历史配置 SHA-256：{basis.sourceHash}</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{basis.definition}</pre>
      <textarea aria-label="映射后的历史策略 JSON" disabled={busy} value={text} onChange={event => { setText(event.target.value); setConfirmed(false) }} placeholder={'{"sandboxMode":"read-only","allowedTools":["eden_read_file"],"deniedTools":[]}'} className="mt-2 min-h-28 w-full rounded border p-2" />
      <textarea aria-label="历史策略映射依据" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明原配置来源、工具名映射及保留的限制" className="mt-2 w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我已核对源配置，确认映射未遗漏历史限制。</label>
      <button disabled={busy || !confirmed || !text || !note} onClick={() => void save()} className="mt-2 rounded border px-2 py-1">保存策略恢复记录</button>
      <p>保存会固定角色与技能、收窄预算；不会延长旧截止期限、确认模型归属或启动任务。</p></>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
