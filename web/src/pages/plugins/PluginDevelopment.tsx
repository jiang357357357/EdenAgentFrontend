import { PluginHistory } from "./PluginHistory"
import { useEffect, useState } from 'react'
import { pluginDevelopment as api, type PluginDraftSummary, type PluginVersionSummary } from '../../lib/plugin-development'

export function PluginDevelopment({ onChanged }: { onChanged: () => Promise<void> }) {
  const [drafts, setDrafts] = useState<PluginDraftSummary[]>([])
  const [versions, setVersions] = useState<PluginVersionSummary[]>([])
  const [id, setId] = useState(''), [revision, setRevision] = useState('')
  const [manifest, setManifest] = useState(''), [source, setSource] = useState('')
  const [saved, setSaved] = useState(false), [busy, setBusy] = useState(false)
  const [result, setResult] = useState(''), [error, setError] = useState('')
  const [readRoot, setReadRoot] = useState('')
  async function refresh() { setDrafts(await api.drafts()); setVersions(await api.versions()) }
  useEffect(() => { void refresh().catch(reason => setError(String(reason))) }, [])
  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { const value = await work(); setResult(JSON.stringify(value, null, 2)); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const edited = () => { setSaved(false); setRevision(''); setResult('') }
  return <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
    <h2 className="font-medium">插件开发与版本</h2>
    <p className="mt-1 text-xs text-stone-500">编辑清单与 TypeScript 源码。保存、验证、运行测试、安装分别操作；安装要求该版本已有成功测试记录。</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <select aria-label="选择插件草稿" disabled={busy} value={id} onChange={event => {
        const selected = event.target.value; setId(selected); setRevision(''); setSaved(false); setManifest(''); setSource('')
        if (selected) void run(async () => { const draft = await api.read(selected); setManifest(JSON.stringify(draft.manifest, null, 2)); setSource(draft.source); setSaved(true); return { loaded: selected } })
      }} className="rounded border px-2 py-1 text-sm">
        <option value="">新建草稿</option>{drafts.map(draft => <option key={draft.id} value={draft.id}>{draft.name} · {draft.version}</option>)}
      </select>
      <button disabled={busy} onClick={() => void run(refresh)} className="rounded border px-3 py-1 text-sm">刷新草稿</button>
    </div>
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <label className="text-xs">插件清单 JSON<textarea disabled={busy} value={manifest} onChange={event => { setManifest(event.target.value); edited() }} spellCheck={false} className="mt-1 h-64 w-full rounded border p-2 font-mono" /></label>
      <label className="text-xs">index.ts<textarea disabled={busy} value={source} onChange={event => { setSource(event.target.value); edited() }} spellCheck={false} className="mt-1 h-64 w-full rounded border p-2 font-mono" /></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-2 text-sm">
      <button disabled={busy || !manifest || !source} onClick={() => void run(async () => { const parsed = JSON.parse(manifest); await api.save({ manifest: parsed, source }); setId(parsed.id); setSaved(true); setRevision(''); return { saved: parsed.id } })} className="rounded border px-3 py-1 disabled:opacity-40">保存草稿</button>
      <button disabled={busy || !saved} onClick={() => void run(async () => { const value = await api.validate(id); setRevision(value.revision); return value })} className="rounded border px-3 py-1 disabled:opacity-40">验证源码</button>
      <button disabled={busy || !saved} onClick={() => void run(() => api.test(id))} className="rounded border px-3 py-1 disabled:opacity-40">运行声明测试</button>
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
