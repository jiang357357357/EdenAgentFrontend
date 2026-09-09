import { useState } from 'react'
import { usePluginDevelopment } from '../../lib/plugin-development'

export function PluginDraftHelp({ onTemplate }: { onTemplate: (manifest: string, source: string) => void }) {
  const api = usePluginDevelopment()
  const [guide, setGuide] = useState<Awaited<ReturnType<typeof api.describe>> | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function load() {
    setBusy(true); setError('')
    try { setGuide(await api.describe()) } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="my-3 rounded border p-2 text-xs"><summary>开发指南与新建示例</summary>
    <button disabled={busy} onClick={() => void load()}>读取当前宿主开发规范</button>
    {guide && <><p className="mt-2">{guide.handler}</p><p>{guide.dependencies}</p><p>{guide.schema}</p><p>{guide.limits}</p><p>{guide.workflow}</p>
      <button disabled={busy} className="mt-2 rounded border p-1" onClick={() => onTemplate(JSON.stringify(guide.manifestExample, null, 2), guide.sourceExample)}>将完整示例填入编辑器</button>
      <p>示例只填入本地编辑器。请修改插件 ID、功能与声明样例，再分别保存和处理；不会自动执行代码。</p></>}
    {error && <p role="alert">{error}</p>}
  </details>
}
