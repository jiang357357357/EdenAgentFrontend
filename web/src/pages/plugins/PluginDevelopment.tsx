import { PluginDraftHelp } from './PluginDraftHelp'
import { PluginHistory } from "./PluginHistory"
import { useEffect, useState } from 'react'
import { usePluginDevelopment, type PluginDraftSummary, type PluginVersionSummary } from '../../lib/plugin-development'

export function PluginDevelopment({ onChanged }: { onChanged: () => Promise<void> }) {
  const api = usePluginDevelopment()
  const [drafts, setDrafts] = useState<PluginDraftSummary[]>([])
  const [versions, setVersions] = useState<PluginVersionSummary[]>([])
  const [id, setId] = useState(''), [revision, setRevision] = useState('')
  const [manifest, setManifest] = useState(''), [source, setSource] = useState('')
  const [saved, setSaved] = useState(false), [busy, setBusy] = useState(false)
  const [result, setResult] = useState(''), [error, setError] = useState('')
  const [draftRevision, setDraftRevision] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [readRoot, setReadRoot] = useState('')
  async function refresh() { setDrafts(await api.drafts()); setVersions(await api.versions()) }
  useEffect(() => { void refresh().catch(reason => setError(String(reason))) }, [])
  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { const value = await work(); setResult(JSON.stringify(value, null, 2)); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const edited = () => { setDirty(true); setSaved(false); setRevision(''); setResult('') }
  const canReplace = () => !dirty || window.confirm('编辑器有未保存修改，确认放弃这些修改并替换内容？可先导出草稿备份。')
  function exportDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'eden.plugin-draft-edit.v1', manifestText: manifest, source, draftRevision }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `${id || 'new-plugin'}-draft.json`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function importDraft(file?: File) {
    if (!file || busy || !canReplace()) return
    setBusy(true); setError('')
    try {
      if (file.size > 1024 * 1024) throw new Error('草稿备份超过 1 MiB')
      const value = JSON.parse(await file.text())
      if (!value || value.format !== 'eden.plugin-draft-edit.v1' || typeof value.manifestText !== 'string' || typeof value.source !== 'string' || value.source.length > 65536) throw new Error('不是支持的插件编辑备份')
      setId(''); setManifest(value.manifestText); setSource(value.source); setDraftRevision(null); edited()
      setResult('已恢复到编辑器。备份中的旧修订不作为覆盖授权；保存同名已有草稿前须重新读取并核对。')
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
    <h2 className="font-medium">插件开发与版本</h2>
    <p className="mt-1 text-xs text-stone-500">编辑清单与 TypeScript 源码。保存、验证、运行测试、安装分别操作；验证与声明测试绑定已保存草稿修订；安装要求该构建版本已有成功测试记录。</p>
    <PluginDraftHelp onTemplate={(nextManifest, nextSource) => {
      if (busy || !canReplace()) return
      setId(''); setManifest(nextManifest); setSource(nextSource); setDraftRevision(null); edited()
    }} />
    <div className="mt-3 flex flex-wrap gap-2">
      <select aria-label="选择插件草稿" disabled={busy} value={id} onChange={event => {
        if (!canReplace()) return
        const selected = event.target.value; setDirty(false); setId(selected); setDraftRevision(null); setRevision(''); setSaved(false); setManifest(''); setSource('')
        if (selected) void run(async () => { const draft = await api.read(selected); setManifest(JSON.stringify(draft.manifest, null, 2)); setSource(draft.source); setDraftRevision(draft.draftRevision ?? null); setSaved(true); setDirty(false); return { loaded: selected } })
      }} className="rounded border px-2 py-1 text-sm">
        <option value="">新建草稿</option>{drafts.map(draft => <option key={draft.id} value={draft.id}>{draft.name} · {draft.version}</option>)}
      </select>
      <label className="rounded border px-3 py-1 text-sm">导入编辑备份<input type="file" accept="application/json,.json" disabled={busy} className="block max-w-48" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importDraft(file) }} /></label>
      <button disabled={busy || (!manifest && !source)} onClick={exportDraft} className="rounded border px-3 py-1 text-sm">导出编辑内容</button>
      <button disabled={busy} onClick={() => void run(refresh)} className="rounded border px-3 py-1 text-sm">刷新草稿</button>
    </div>
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <label className="text-xs">插件清单 JSON<textarea disabled={busy} value={manifest} onChange={event => { setManifest(event.target.value); edited() }} spellCheck={false} className="mt-1 h-64 w-full rounded border p-2 font-mono" /></label>
      <label className="text-xs">index.ts<textarea disabled={busy} value={source} onChange={event => { setSource(event.target.value); edited() }} spellCheck={false} className="mt-1 h-64 w-full rounded border p-2 font-mono" /></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-2 text-sm">
      <button disabled={busy || !manifest || !source} onClick={() => void run(async () => { const parsed = JSON.parse(manifest); const draft = await api.save({ manifest: parsed, source, expectedDraftRevision: parsed.id === id ? draftRevision : null }); setDraftRevision(draft.draftRevision ?? null); setId(parsed.id); setSaved(true); setDirty(false); setRevision(''); return { saved: parsed.id } })} className="rounded border px-3 py-1 disabled:opacity-40">保存草稿</button>
      <button disabled={busy || !saved || !draftRevision} onClick={() => void run(async () => { const value = await api.validate(id, draftRevision!); setRevision(value.revision); return value })} className="rounded border px-3 py-1 disabled:opacity-40">验证源码</button>
      <button disabled={busy || !saved || !draftRevision} onClick={() => void run(() => api.test(id, draftRevision!))} className="rounded border px-3 py-1 disabled:opacity-40">运行声明测试</button>
      <button disabled={busy || !saved || !revision} onClick={() => void run(async () => { const value = await api.install(id, revision); await onChanged(); return value })} className="rounded border px-3 py-1 disabled:opacity-40">安装此版本</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {result && <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 text-xs">{result}</pre>}
    <label className="mt-4 block text-xs">只读工作区（填写后点击下方授权按钮；未声明权限的插件留空）<input value={readRoot} onChange={event => setReadRoot(event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
    <div className="mt-3 space-y-2">{versions.filter(version => !id || version.id === id).map(version => <div key={`${version.id}:${version.revision}`} className="flex flex-wrap items-center gap-3 rounded bg-stone-50 p-2 text-xs">
      <span className="flex-1">{version.id} · {version.version} · {version.revision.slice(0, 12)}{version.active ? ' · 已启用' : ''}</span>
      <button disabled={busy} onClick={() => void run(() => api.version(version.id, version.revision))}>查看源码与报告</button>
      <button disabled={busy || !readRoot} onClick={() => void run(() => api.grant(version.id, version.revision, readRoot))}>授权此版本读取工作区</button>
      <button disabled={busy || version.active} onClick={() => void run(async () => { const value = await api.activate(version.id, version.revision, readRoot); await onChanged(); return value })}>切换至此版本</button>
    </div>)}</div>
    {id && <PluginHistory key={id} id={id} versions={versions.filter(version => version.id === id)} />}
  </section>
}
