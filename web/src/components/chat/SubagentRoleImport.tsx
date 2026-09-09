import { useState } from 'react'
import { roleImportEntrySchema } from '@eden/api'
import type { RoleImportEntry } from '@eden/api'
import { useScopedRpc } from '../../lib/use-scoped-rpc'

interface Candidate { entry: RoleImportEntry | null; label: string; issue: string }
interface Plan { previewId: string; expiresAt: number; items: { name: string; scope: 'user' | 'project'; workspaceRoot: string; replaces: boolean; definition: RoleImportEntry['definition'] }[] }
export function SubagentRoleImport({ onSaved }: { onSaved: () => Promise<void> }) {
  const rpcRequest = useScopedRpc()
  const [rows, setRows] = useState<Candidate[]>([]), [selected, setSelected] = useState<number[]>([]), [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmed, setConfirmed] = useState(false)
  async function read(file?: File) {
    if (!file) return
    setBusy(true); setError(''); setPlan(null); setRows([]); setSelected([]); setConfirmed(false)
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error('审阅文件不能超过 64 MiB')
      const bundle = JSON.parse(await file.text())
      if (bundle?.format !== 'eden.legacy-roles-review.v1' || !Array.isArray(bundle.roles) || bundle.roles.length > 512) throw new Error('不是支持的角色审阅文件')
      setRows(bundle.roles.map((raw: unknown, index: number) => {
        const parsed = roleImportEntrySchema.safeParse(raw)
        return parsed.success ? { entry: parsed.data, label: `${parsed.data.scope} · ${parsed.data.definition.name} · ${parsed.data.source}`, issue: '' } :
          { entry: null, label: `记录 ${index + 1}`, issue: '配置或工具映射尚未完成，请查看审阅文件中的 issues 和原文。' }
      }))
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function preview() {
    setBusy(true); setError(''); setPlan(null); setConfirmed(false)
    try {
      const entries = selected.map(index => rows[index]!.entry!).filter(Boolean)
      setPlan(await rpcRequest('agent.roles.import.preview', { entries }))
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function apply() {
    if (!plan) return
    setBusy(true); setError('')
    try {
      await rpcRequest('agent.roles.import.apply', { previewId: plan.previewId, confirmDefinitions: true })
      setPlan(null); setSelected([]); setConfirmed(false); await onSaved()
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-3 rounded border p-2">
    <summary>导入旧角色审阅文件</summary>
    <p>选择离线导出的 JSON，勾选候选并核对目标。项目条目导入当前工作区；每批最多 32 项、512 KiB。候选是待确认配置，原文摘要不代替内容审阅。</p>
    <input aria-label="角色审阅 JSON" type="file" accept=".json,application/json" disabled={busy} onChange={event => void read(event.target.files?.[0])} />
    {rows.map((row, index) => <label key={index} className="mt-2 block break-all"><input type="checkbox" disabled={busy || !row.entry || !selected.includes(index) && selected.length >= 32} checked={selected.includes(index)} onChange={event => { setSelected(previous => event.target.checked ? [...previous, index] : previous.filter(value => value !== index)); setPlan(null); setConfirmed(false) }} /> {row.label}{row.issue && <span className="text-red-700"> · {row.issue}</span>}</label>)}
    <button disabled={busy || !selected.length} onClick={() => void preview()} className="mt-2 rounded border px-2 py-1">预览所选角色</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {plan && <div className="mt-2">
      {plan.items.map(item => <details key={`${item.scope}:${item.name}`} className="mt-2 rounded border p-2"><summary>{item.name} · {item.scope === 'project' ? item.workspaceRoot : '当前世界用户配置'} · {item.replaces ? '覆盖已有配置' : '新增覆盖'}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap">{JSON.stringify(item.definition, null, 2)}</pre></details>)}
      <label className="mt-2 block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我已核对角色内容、目标范围与覆盖项。</label>
      <button disabled={busy || !confirmed || Date.now() >= plan.expiresAt} onClick={() => void apply()} className="rounded border px-2 py-1">确认整批保存</button>
    </div>}
  </details>
}
