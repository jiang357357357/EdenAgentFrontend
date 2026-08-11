import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Cable, CheckCircle2,
  ChevronRight, CircleAlert, Clock3, Gamepad2, LoaderCircle, Plus, Power,
  RefreshCw, Search, Settings2, ShieldCheck, TestTube2, X,
} from "lucide-react"
import { motion } from "motion/react"
import {
  createConnector,
  listConnectorCatalog,
  listConnectors,
  updateConnector,
  type Connector,
  type ConnectorCapability,
  type ConnectorCatalogEntry,
} from "../../lib/mon_agent_api"

type CapabilityParameter = [name: string, type: string, required: boolean, description: string]

function schemaType(schema: Record<string, unknown>) {
  const choices = Array.isArray(schema.enum) ? schema.enum : []
  if (choices.length) return `enum (${choices.join(" / ")})`
  if (Array.isArray(schema.type)) return schema.type.join(" | ")
  return typeof schema.type === "string" ? schema.type : "any"
}

function parametersFor(capability?: ConnectorCapability): CapabilityParameter[] {
  if (!capability) return []
  const properties = capability.schema?.properties
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return []
  const required = new Set(Array.isArray(capability.schema.required) ? capability.schema.required.map(String) : [])
  return Object.entries(properties).map(([name, value]) => {
    const schema = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
    return [name, schemaType(schema), required.has(name), typeof schema.description === "string" ? schema.description : ""]
  })
}

function titleFor(connector: Connector, catalog?: ConnectorCatalogEntry) {
  return connector.display_name || `${catalog?.name || connector.connector_key} · ${connector.identity_key}`
}

function stateFor(connector: Connector) {
  const state = String(connector.runtime_state || connector.runtime?.state || "")
  if (state === "online") return { label: "已连接", color: "bg-emerald-500", tone: "text-emerald-700" }
  if (state === "connecting" || state === "reconnecting") return { label: state === "connecting" ? "连接中" : "正在重连", color: "bg-amber-500", tone: "text-amber-700" }
  const error = connector.error || connector.last_error
  if (connector.desired_state === "connected") return { label: error ? "连接异常" : "等待连接", color: error ? "bg-red-500" : "bg-amber-500", tone: error ? "text-red-600" : "text-amber-700" }
  return { label: "已停用", color: "bg-stone-400", tone: "text-stone-500" }
}

function ConnectorIcon({ kind }: { kind: string }) {
  return <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff0dc] text-[#d87300]">{kind === "openttd" || kind === "gamepad" ? <Gamepad2 className="h-5 w-5" /> : <Cable className="h-5 w-5" />}</div>
}

function invocationExample(connector: Connector, capability: ConnectorCapability, parameters: CapabilityParameter[]) {
  const values = Object.fromEntries(parameters.map(([name]) => [name, `<${name}>`]))
  if (capability.kind === "event") {
    return { event: `${connector.connector_key}.${capability.id}`, direction: "input" }
  }
  if (capability.kind === "query") {
    if (!capability.invocation?.tool) {
      return { capability: `${connector.connector_key}.${capability.id}`, arguments: values }
    }
    return {
      tool: capability.invocation.tool,
      arguments: { connector_id: connector.id, query: capability.invocation?.query || capability.id, ...values },
    }
  }
  return {
    tool: capability.invocation?.tool || "execute_connector_action",
    arguments: { connector_id: connector.id, action: capability.invocation?.action || capability.id, payload: values },
  }
}

export function ConnectorPage({ onBack }: { onBack: () => void }) {
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [catalog, setCatalog] = useState<ConnectorCatalogEntry[]>([])
  const [selectedID, setSelectedID] = useState<string>("")
  const [selectedCapabilityID, setSelectedCapabilityID] = useState("")
  const [query, setQuery] = useState("")
  const [capabilityQuery, setCapabilityQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [newType, setNewType] = useState("")
  const [newIdentity, setNewIdentity] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const [rows, catalogResult] = await Promise.all([listConnectors(), listConnectorCatalog()])
      setConnectors(rows)
      setCatalog(catalogResult.connectors)
      setNewType((current) => catalogResult.connectors.some((entry) => entry.key === current) ? current : catalogResult.connectors[0]?.key || "")
      setSelectedID((current) => rows.some((row) => String(row.id) === current) ? current : String(rows[0]?.id ?? ""))
      if (catalogResult.errors?.length) setError(catalogResult.errors.map((item) => `${item.key}: ${item.error}`).join("\n"))
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  const catalogByKey = useMemo(() => Object.fromEntries(catalog.map((entry) => [entry.key, entry])), [catalog])
  const selected = connectors.find((item) => String(item.id) === selectedID) || connectors[0]
  const selectedCatalog = selected ? catalogByKey[selected.connector_key] : undefined
  const capabilities = selectedCatalog?.capabilities || []
  const selectedCapability = capabilities.find((item) => item.id === selectedCapabilityID) || capabilities[0]
  const selectedParameters = parametersFor(selectedCapability)

  useEffect(() => {
    setSelectedCapabilityID((current) => capabilities.some((item) => item.id === current) ? current : capabilities[0]?.id || "")
    setCapabilityQuery("")
  }, [selected?.id, selectedCatalog?.revision])

  const visibleConnectors = useMemo(() => connectors.filter((connector) => {
    const search = query.trim().toLocaleLowerCase()
    return (!search || `${titleFor(connector, catalogByKey[connector.connector_key])} ${connector.connector_key}`.toLocaleLowerCase().includes(search))
  }), [catalogByKey, connectors, query])
  const visibleCapabilities = capabilities.filter((item) => !capabilityQuery.trim() || `${item.label} ${item.description}`.toLocaleLowerCase().includes(capabilityQuery.trim().toLocaleLowerCase()))

  async function toggle() {
    if (!selected) return
    setBusy(String(selected.id)); setError("")
    try {
      const updated = await updateConnector(selected.id, { desired_state: selected.desired_state === "connected" ? "disconnected" : "connected" })
      setConnectors((items) => items.map((item) => String(item.id) === String(updated.id) ? updated : item))
      window.setTimeout(() => void refresh(), 800)
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)) }
    finally { setBusy("") }
  }

  async function addConnector() {
    if (!newType || !newIdentity.trim()) return
    setBusy("add"); setError("")
    try {
      const created = await createConnector({ connector_key: newType, identity_key: newIdentity.trim(), desired_state: "disconnected" })
      setConnectors((items) => [...items, created]); setSelectedID(String(created.id)); setNewIdentity(""); setAddOpen(false)
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)) }
    finally { setBusy("") }
  }

  const status = selected ? stateFor(selected) : undefined
  const inputCapabilities = visibleCapabilities.filter((item) => item.direction === "input")
  const outputCapabilities = visibleCapabilities.filter((item) => item.direction === "output")

  return <motion.main key="connectors" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="surface-scrollbars grid h-full min-h-0 grid-cols-[29%_34%_minmax(0,1fr)] bg-[#f7f6f3] text-stone-800">
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-stone-200 bg-[#fbfaf8] p-5">
      <div className="flex items-center gap-3"><button type="button" onClick={onBack} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="返回"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="text-2xl font-semibold">连接器</h1><p className="text-xs text-stone-400">{connectors.length} 个连接器</p></div><button type="button" onClick={() => void refresh()} className="ml-auto rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="刷新"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>
      <label className="mt-5 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3"><Search className="h-4 w-4 text-stone-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索连接器…" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <button type="button" onClick={() => setAddOpen(true)} className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#d87300] text-sm text-white hover:bg-[#c46600]"><Plus className="h-4 w-4" />添加连接器</button>
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">{loading && connectors.length === 0 ? <div className="flex h-32 items-center justify-center text-sm text-stone-400"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />读取连接器</div> : visibleConnectors.map((connector) => { const active = String(connector.id) === String(selected?.id); const itemState = stateFor(connector); const entry = catalogByKey[connector.connector_key]; return <button key={connector.id} type="button" onClick={() => setSelectedID(String(connector.id))} className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left ${active ? "border-[#e27a00] bg-[#fff8ef]" : "border-stone-200 bg-white hover:bg-stone-50"}`}><ConnectorIcon kind={entry?.icon || connector.connector_key} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{titleFor(connector, entry)}</div><div className={`mt-1 flex items-center gap-1.5 text-xs ${itemState.tone}`}><span className={`h-2 w-2 rounded-full ${itemState.color}`} />{itemState.label}</div></div><ChevronRight className={`h-4 w-4 ${active ? "text-[#d87300]" : "text-stone-300"}`} /></button>})}{!loading && visibleConnectors.length === 0 && <div className="py-16 text-center text-sm text-stone-400">没有符合条件的连接器</div>}</div>
    </aside>

    <section className="flex min-h-0 min-w-0 flex-col border-r border-stone-200 bg-[#f8f7f5] p-5">
      {selected ? <><div className="flex items-center gap-3"><ConnectorIcon kind={selectedCatalog?.icon || selected.connector_key} /><div className="min-w-0"><h2 className="truncate text-lg font-semibold">{titleFor(selected, selectedCatalog)}</h2><p className={`mt-0.5 flex items-center gap-1.5 text-xs ${status?.tone}`}><span className={`h-2 w-2 rounded-full ${status?.color}`} />{status?.label}</p></div><button type="button" disabled={busy === String(selected.id)} onClick={() => void toggle()} className="ml-auto flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs"><Power className="h-3.5 w-3.5" />{selected.desired_state === "connected" ? "停用" : "启用"}</button></div>
      <div className="mt-5 flex border-b border-stone-200 text-sm"><button className="border-b-2 border-[#d87300] px-4 pb-3 font-medium text-[#d87300]">能力</button><button className="px-4 pb-3 text-stone-400">最近事件</button></div>
      <label className="mt-4 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3"><Search className="h-4 w-4 text-stone-400" /><input value={capabilityQuery} onChange={(event) => setCapabilityQuery(event.target.value)} placeholder="搜索能力…" className="h-10 flex-1 bg-transparent text-sm outline-none" /></label>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{([['输入事件', inputCapabilities], ['输出动作', outputCapabilities]] as const).map(([label, items]) => items.length ? <div key={label} className="mb-5"><h3 className="mb-2 text-xs font-semibold text-stone-500">{label}</h3><div className="space-y-2">{items.map((item) => { const active = item.id === selectedCapability?.id; return <button key={item.id} type="button" onClick={() => setSelectedCapabilityID(item.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${active ? "border-[#e27a00] bg-[#fff8ef]" : "border-stone-200 bg-white hover:bg-stone-50"}`}>{item.direction === "input" ? <ArrowDownToLine className="h-5 w-5 text-blue-500" /> : <ArrowUpFromLine className="h-5 w-5 text-[#d87300]" />}<div className="min-w-0 flex-1"><div className="flex items-center gap-2"><b className="text-sm">{item.label}</b><span className={`rounded px-2 py-0.5 text-[10px] ${item.direction === "input" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>{item.direction === "input" ? "输入" : "输出"}</span></div><p className="mt-1 text-xs text-stone-500">{item.description}</p></div><ChevronRight className="h-4 w-4 text-stone-300" /></button>})}</div></div> : null)}{capabilities.length === 0 && <div className="py-16 text-center text-sm text-stone-400">该连接器类型暂未提供能力定义</div>}</div>
      {(selected.error || selected.last_error) && <div className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><CircleAlert className="h-4 w-4 shrink-0" />{selected.error || selected.last_error}</div>}</> : <div className="flex h-full items-center justify-center text-sm text-stone-400">添加连接器后在这里管理能力</div>}
    </section>

    <section className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-[#fbfaf8] p-7">
      {selected && selectedCapability ? <div className="mx-auto max-w-4xl"><div className="flex items-start"><div><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff0dc] text-[#d87300]">{selectedCapability.direction === "input" ? <ArrowDownToLine className="h-5 w-5" /> : <ArrowUpFromLine className="h-5 w-5" />}</div><div><h2 className="text-2xl font-semibold">{selectedCapability.label}</h2><p className="mt-1 font-mono text-xs text-stone-400">{selected.connector_key}.{selectedCapability.id}</p></div></div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded bg-orange-50 px-2 py-1 text-xs text-orange-700">{selectedCapability.direction === "input" ? "输入事件" : selectedCapability.kind === "query" ? "只读查询" : "输出动作"}</span>{selectedCapability.kind === "action" && <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">需审批</span>}<span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">清单 v{selectedCatalog?.version || "—"}</span>{selectedCatalog?.worker_isolated && <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">独立 Worker</span>}</div></div></div>
      <div className="mt-6 grid grid-cols-4 divide-x divide-stone-200 rounded-2xl border border-stone-200 bg-white p-4"><div className="flex items-center gap-2 px-3 text-emerald-700"><Activity className="h-5 w-5" /><b className="text-sm">{status?.label}</b></div><div className="px-4"><p className="text-lg font-semibold">—</p><p className="text-[11px] text-stone-400">延迟</p></div><div className="px-4"><p className="text-lg font-semibold">—</p><p className="text-[11px] text-stone-400">今日调用</p></div><div className="px-4"><p className="text-lg font-semibold">—</p><p className="text-[11px] text-stone-400">成功率</p></div></div>
      <div className="mt-6 space-y-5"><div><h3 className="text-sm font-semibold">功能说明</h3><p className="mt-2 text-sm leading-6 text-stone-500">{selectedCapability.description}</p></div><div><h3 className="text-sm font-semibold">参数配置</h3><div className="mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white"><table className="w-full text-left text-xs"><thead className="bg-stone-50 text-stone-500"><tr><th className="px-4 py-3">字段</th><th className="px-4 py-3">要求</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">说明</th></tr></thead><tbody>{selectedParameters.map(([name,type,required,description]) => <tr key={name} className="border-t border-stone-200"><td className="px-4 py-3 font-mono">{name}</td><td className="px-4 py-3"><span className={`rounded px-2 py-0.5 ${required ? "bg-red-50 text-red-600" : "bg-stone-100 text-stone-500"}`}>{required ? "必填" : "可选"}</span></td><td className="px-4 py-3">{type}</td><td className="px-4 py-3 text-stone-500">{description}</td></tr>)}</tbody></table>{selectedParameters.length === 0 && <div className="px-4 py-5 text-xs text-stone-400">该能力无需调用参数</div>}</div></div>
      <div className="grid grid-cols-2 gap-4"><div className="rounded-xl border border-stone-200 bg-white p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />权限策略</h3><p className="mt-3 text-xs text-stone-500">输出动作执行前遵循当前会话的权限模式。</p></div><div className="rounded-xl border border-stone-200 bg-white p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="h-4 w-4" />连接配置</h3><p className="mt-3 text-xs text-stone-500">身份标识</p><p className="mt-1 font-mono text-sm">{selected.identity_key}</p></div></div>
      <div className="rounded-xl border border-stone-200 bg-white p-4"><h3 className="text-sm font-semibold">{selectedCapability.kind === "event" ? "事件标识" : "调用示例"}</h3><pre className="mt-3 overflow-x-auto rounded-lg bg-stone-50 p-4 text-xs text-stone-600">{JSON.stringify(invocationExample(selected, selectedCapability, selectedParameters), null, 2)}</pre></div></div>
      <div className="mt-6 flex gap-3"><button type="button" className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-3 text-sm"><TestTube2 className="h-4 w-4" />测试连接</button><button type="button" onClick={() => void refresh()} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-3 text-sm"><Clock3 className="h-4 w-4" />刷新状态</button><button type="button" disabled className="flex flex-[1.2] items-center justify-center gap-2 rounded-xl bg-[#d87300] py-3 text-sm text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />配置已保存</button></div></div> : <div className="flex h-full items-center justify-center text-sm text-stone-400">选择一项能力查看详情</div>}
    </section>

    {addOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-5 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"><div className="flex items-center"><div><h2 className="text-lg font-semibold">添加连接器</h2><p className="mt-1 text-xs text-stone-500">类型来自 Agent Server 当前已安装的连接器清单。</p></div><button type="button" onClick={() => setAddOpen(false)} className="ml-auto rounded-full p-2 text-stone-400 hover:bg-stone-100"><X className="h-4 w-4" /></button></div><label className="mt-5 block text-xs font-medium text-stone-600">连接器类型</label><select value={newType} onChange={(event) => setNewType(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm">{catalog.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}</select>{newType && catalogByKey[newType]?.description && <p className="mt-2 text-xs leading-5 text-stone-500">{catalogByKey[newType].description}</p>}<label className="mt-4 block text-xs font-medium text-stone-600">身份标识</label><input autoFocus value={newIdentity} onChange={(event) => setNewIdentity(event.target.value)} placeholder="例如 personal 或 main" className="mt-1 h-11 w-full rounded-xl border border-stone-200 px-3 text-sm outline-none focus:border-amber-400" /><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setAddOpen(false)} className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm">取消</button><button type="button" disabled={!newType || !newIdentity.trim() || busy === "add"} onClick={() => void addConnector()} className="rounded-xl bg-[#d87300] px-5 py-2.5 text-sm text-white disabled:opacity-40">{busy === "add" ? "添加中…" : "添加"}</button></div></div></div>}
  </motion.main>
}
