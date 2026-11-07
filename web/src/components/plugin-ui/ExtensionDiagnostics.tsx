import { useEffect, useRef, useState } from 'react'
import { usePluginUi } from './PluginUiProvider'

export function ExtensionDiagnostics({ onClose }: { onClose(): void }) {
  const { extensions } = usePluginUi(), dialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])
  return <dialog ref={dialog} className="max-h-[85vh] w-[min(90vw,800px)] overflow-auto rounded border border-border bg-surface p-5 text-text" aria-label="扩展诊断" onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="flex justify-between"><h2>扩展诊断</h2><button onClick={onClose}>关闭</button></header>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {!extensions.length && <p>当前没有第二版扩展。旧版界面插件继续由原宿主管理。</p>}
    {extensions.map(item => {
      const diagnostic = item.controller.status()
      return <section className="my-4 border-t border-border pt-3" key={`${item.module.pluginId}/${item.module.componentId}`}>
        <h3>{item.module.pluginName} · {item.module.componentId}</h3><p>执行状态：{diagnostic.state}</p>
        <p>在途调用：{diagnostic.activeOperations} · 已进入执行：{diagnostic.runningOperations}</p>
        {diagnostic.error && <p role="alert" className="text-danger">{diagnostic.error}</p>}
        <button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await item.controller.restart() } catch (reason) { setError(String(reason)) } finally { setBusy(false) } }}>重启扩展宿主</button>
        <pre className="mt-2 whitespace-pre-wrap text-xs">{diagnostic.logs.join('\n') || '暂无日志'}</pre>
      </section>
    })}
  </dialog>
}
