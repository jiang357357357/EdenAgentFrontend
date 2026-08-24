import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, PackagePlus, RefreshCw, ShieldCheck, Store, Trash2 } from "lucide-react"
import {
  addPluginMarketSource,
  enablePlugin,
  inspectPlugin,
  inspectPluginMarketRelease,
  installPlugin,
  listPluginMarketReleases,
  listPluginMarketSources,
  listPlugins,
  refreshPluginMarketSource,
  removePluginMarketSource,
  setPluginPermissions,
  uninstallPlugin,
  type Plugin,
  type PluginMarketRelease,
  type PluginMarketSource,
} from "../../lib/agent-client"

export function PluginPage({ onBack }: { onBack: () => void }) {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [marketSources, setMarketSources] = useState<PluginMarketSource[]>([])
  const [marketReleases, setMarketReleases] = useState<PluginMarketRelease[]>([])
  const [source, setSource] = useState("")
  const [previewID, setPreviewID] = useState("")
  const [previewLabel, setPreviewLabel] = useState("")
  const [marketForm, setMarketForm] = useState({ id: "", name: "", url: "", keyID: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const refresh = useCallback(async () => {
    const [nextPlugins, nextSources] = await Promise.all([listPlugins(), listPluginMarketSources()])
    setPlugins(nextPlugins)
    setMarketSources(nextSources)
    try { setMarketReleases(await listPluginMarketReleases()) }
    catch { setMarketReleases([]) }
  }, [])
  useEffect(() => { void refresh().catch((value) => setError(String(value))) }, [refresh])
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("")
    try { await action(); await refresh() } catch (value) { setError(value instanceof Error ? value.message : String(value)) }
    finally { setBusy(false) }
  }
  return <main className="surface-scrollbars h-full overflow-auto bg-[#f7f6f3] p-6 text-stone-800">
    <header className="mb-6 flex items-center gap-3">
      <button onClick={onBack} className="rounded-lg p-2 hover:bg-stone-200" aria-label="返回"><ArrowLeft className="h-5 w-5" /></button>
      <div><h1 className="text-2xl font-semibold">插件</h1><p className="text-xs text-stone-500">版本、信任、权限与运行时</p></div>
      <button onClick={() => void refresh()} className="ml-auto rounded-lg p-2 hover:bg-stone-200" aria-label="刷新"><RefreshCw className="h-4 w-4" /></button>
    </header>
    {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex gap-2"><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="本地插件目录" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
      <button disabled={busy || !source} onClick={() => void run(async () => { const preview = await inspectPlugin(source); setPreviewID(preview.previewID); setPreviewLabel(`${preview.name} ${preview.version}`) })} className="rounded-lg bg-stone-800 px-4 py-2 text-sm text-white disabled:opacity-40">检查</button>
      <button disabled={busy || !previewID} onClick={() => void run(async () => { await installPlugin(previewID); setPreviewID(""); setPreviewLabel(""); setSource("") })} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-40"><PackagePlus className="h-4 w-4" />安装{previewLabel ? ` ${previewLabel}` : ""}</button></div>
    </section>
    <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2"><Store className="h-4 w-4" /><h2 className="font-medium">签名插件市场</h2></div>
      <div className="grid gap-2 md:grid-cols-4">
        <input value={marketForm.id} onChange={(event) => setMarketForm({ ...marketForm, id: event.target.value })} placeholder="来源 ID" className="rounded-lg border px-3 py-2 text-sm" />
        <input value={marketForm.name} onChange={(event) => setMarketForm({ ...marketForm, name: event.target.value })} placeholder="显示名称" className="rounded-lg border px-3 py-2 text-sm" />
        <input value={marketForm.url} onChange={(event) => setMarketForm({ ...marketForm, url: event.target.value })} placeholder="HTTPS 索引 URL" className="rounded-lg border px-3 py-2 text-sm" />
        <input value={marketForm.keyID} onChange={(event) => setMarketForm({ ...marketForm, keyID: event.target.value })} placeholder="可信密钥 ID" className="rounded-lg border px-3 py-2 text-sm" />
      </div>
      <button disabled={busy || Object.values(marketForm).some((value) => !value.trim())} onClick={() => void run(async () => {
        await addPluginMarketSource(marketForm)
        await refreshPluginMarketSource(marketForm.id)
        setMarketForm({ id: "", name: "", url: "", keyID: "" })
      })} className="mt-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-40">添加并验证来源</button>
      {marketSources.length > 0 && <div className="mt-4 space-y-2">{marketSources.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2 text-xs">
        <span className="min-w-0 flex-1"><b>{item.name}</b><span className="block truncate text-stone-500">{item.url} · {item.keyID}{item.indexRevision ? ` · ${item.indexRevision.slice(0, 10)}` : ""}</span>{item.lastError && <span className="block text-red-600">{item.lastError}</span>}</span>
        <button disabled={busy} onClick={() => void run(() => refreshPluginMarketSource(item.id))} className="rounded p-1 hover:bg-stone-200" aria-label="刷新来源"><RefreshCw className="h-4 w-4" /></button>
        <button disabled={busy} onClick={() => void run(() => removePluginMarketSource(item.id))} className="rounded p-1 text-red-600 hover:bg-red-50" aria-label="移除来源"><Trash2 className="h-4 w-4" /></button>
      </div>)}</div>}
      {marketReleases.length > 0 && <div className="mt-4 grid gap-2 md:grid-cols-2">{marketReleases.map((release) => <div key={`${release.sourceID}:${release.pluginID}:${release.version}`} className="rounded-lg border border-stone-200 p-3 text-sm">
        <div className="flex gap-2"><span className="min-w-0 flex-1"><b>{release.name}</b><span className="block text-xs text-stone-500">{release.pluginID} · {release.version} · {release.sourceID}</span></span>{release.revoked && <span className="text-xs text-red-600">已撤销</span>}</div>
        <p className="mt-2 text-xs text-stone-600">{release.revocationReason ?? release.description}</p>
        <button disabled={busy || release.revoked} onClick={() => void run(async () => { const preview = await inspectPluginMarketRelease(release.sourceID, release.pluginID, release.version); setPreviewID(preview.previewID); setPreviewLabel(`${release.name} ${release.version}`) })} className="mt-2 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40">下载并审查</button>
      </div>)}</div>}
    </section>
    <div className="grid gap-4">
      {plugins.map((plugin) => {
        const grants = new Map(plugin.permissionGrants.map((grant) => [`${grant.capability}\0${grant.resource}\0${grant.access}`, grant.decision]))
        return <article key={plugin.id} className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h2 className="font-semibold">{plugin.name}</h2><p className="text-xs text-stone-500">{plugin.id} · {plugin.version}</p><p className="mt-2 text-sm text-stone-600">{plugin.description}</p></div>
          <span className={`rounded-full px-2 py-1 text-xs ${plugin.trustState.startsWith("verified:") ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{plugin.trustState}</span></div>
          {plugin.permissions.length > 0 && <div className="mt-4 space-y-2"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" />权限</div>{plugin.permissions.map((permission) => {
            const key = `${permission.capability}\0${permission.resource}\0${permission.access}`
            return <label key={key} className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={grants.get(key) === "allowed"}
                onChange={(event) => {
                  const checked = event.target.checked
                  void run(() => setPluginPermissions(
                    plugin.id,
                    plugin.revision,
                    plugin.permissions.map((item) => ({
                      capability: item.capability,
                      resource: item.resource,
                      access: item.access,
                      decision: item === permission
                        ? (checked ? "allowed" : "denied")
                        : (grants.get(`${item.capability}\0${item.resource}\0${item.access}`) ?? "denied"),
                    })),
                  ))
                }}
              />
              <span className="flex-1">{permission.description}<span className="block text-stone-400">{permission.capability} · {permission.access} · {permission.resource}</span></span>{permission.required && <b className="text-red-600">必需</b>}
            </label>
          })}</div>}
          {plugin.uiContributions.filter((item) => item.location === "plugin_detail").map((item) => <div key={`${item.componentId}:${item.id}`} className={`mt-4 rounded-lg border p-3 text-sm ${item.tone === "success" ? "border-emerald-200 bg-emerald-50" : item.tone === "warning" ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50"}`}><b>{item.title}</b><p className="mt-1 whitespace-pre-wrap text-xs text-stone-600">{item.body}</p></div>)}
          <div className="mt-4 flex gap-2"><button disabled={busy} onClick={() => void run(() => enablePlugin(plugin.id, !plugin.enabled))} className="rounded-lg border px-3 py-2 text-sm">{plugin.enabled ? "停用" : "启用"}</button><button disabled={busy} onClick={() => void run(() => uninstallPlugin(plugin.id))} className="ml-auto flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"><Trash2 className="h-4 w-4" />卸载</button></div>
        </article>
      })}
      {!plugins.length && <p className="py-12 text-center text-sm text-stone-400">尚未安装插件</p>}
    </div>
  </main>
}
