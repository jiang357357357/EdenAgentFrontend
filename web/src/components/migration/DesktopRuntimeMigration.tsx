import { useState } from 'react'

interface MigrationState {
  selection: { revision: string; previousRevision: string | null; roots: { mon: string; local: string } } | null
  roots: { mon: string; local: string }
  busy: boolean
  externallyManaged: boolean
}

export function DesktopRuntimeMigration() {
  const [state, setState] = useState<MigrationState | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  if (!window.edenAgentDesktop) return null
  async function read() {
    setBusy(true); setError('')
    try { setState(await window.edenAgentDesktop!.invoke<MigrationState>('runtime_migration_read')) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function change(command: 'runtime_migration_select' | 'runtime_migration_restore') {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await window.edenAgentDesktop!.invoke<{ changed?: boolean }>(command)
      if (result.changed) { setMessage('启动目录已保存。请重启桌面以使用新配置。'); setState(await window.edenAgentDesktop!.invoke<MigrationState>('runtime_migration_read')) }
    } catch (reason) { setError(`${String(reason)}。若宿主已停止，请重启桌面恢复服务。`) }
    finally { setBusy(false) }
  }
  async function restart() {
    setBusy(true); setError('')
    try { await window.edenAgentDesktop!.invoke('runtime_migration_restart') }
    catch (reason) { setError(String(reason)); setBusy(false) }
  }
  return <details className="mt-4 rounded border border-border p-2 text-xs">
    <summary>迁移后的启动目录</summary>
    <p className="my-2">在主窗口操作。仅选择已初始化或已激活的数据目录；不会导入文件。切换前会明确确认并停止两个宿主。</p>
    <button disabled={busy} onClick={() => void read()} className="rounded border px-2 py-1">读取当前目录</button>
    {state && <><p className="mt-2 break-all">伊甸园：{state.roots.mon}<br />尘世：{state.roots.local}</p>
      {state.selection && <p className="break-all">保存版本：{state.selection.revision}<br />下次伊甸园：{state.selection.roots.mon}<br />下次尘世：{state.selection.roots.local}</p>}
      {state.externallyManaged && <p>存在外部监管的宿主，请使用离线迁移命令切换。</p>}
      <div className="my-2 flex flex-wrap gap-2">
        <button disabled={busy || state.externallyManaged} onClick={() => void change('runtime_migration_select')} className="rounded border px-2 py-1">选择两个目录</button>
        <button disabled={busy || state.externallyManaged || !state.selection?.previousRevision} onClick={() => void change('runtime_migration_restore')} className="rounded border px-2 py-1">恢复上一版目录</button>
      </div></>}
    {(message || error) && <button disabled={busy} onClick={() => void restart()} className="my-2 rounded border px-2 py-1">重启桌面</button>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
