import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, RefreshCw, Search } from "lucide-react"
import { ActivityRail, type ActivityRailProps } from "../../components/layout"
import { mapMessage, projectMessageEvents } from "../../lib/agent-client"
import { rpcRequestForOrigin } from "../../lib/rpc-transport"
import { formatLocalDateTime } from "../../lib/time"
import type { RpcMethodMap } from "../../lib/rpc-contracts"
import type { MessageData } from "../../types"

type SessionSummary = RpcMethodMap["session.list"]["result"][number]
type Origin = "mon" | "local"
type Navigation = Omit<ActivityRailProps, "active" | "onOpenFiles" | "onOpenSessions" | "onOpenAllSessions">
type Category = "all" | "app" | "qq" | "self_awake" | "subagent"

const categoryLabels: Record<Category, string> = {
  all: "全部类型", app: "应用聊天", qq: "QQ 私聊", self_awake: "后台自醒", subagent: "子智能体",
}

function categoryOf(session: SessionSummary): Category {
  if (session.purpose === "self_awake") return "self_awake"
  if (session.purpose === "subagent") return "subagent"
  return session.sourceChannel === "qq" ? "qq" : "app"
}

interface AllSessionsPageProps {
  origin: Origin
  onBack: () => void
  navigation: Navigation
}

export function AllSessionsPage({ origin, onBack, navigation }: AllSessionsPageProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<Category>("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [messages, setMessages] = useState<MessageData[]>([])
  const [messageError, setMessageError] = useState("")
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [olderLoading, setOlderLoading] = useState(false)
  const [before, setBefore] = useState<string | null>(null)
  const messageScopeRef = useRef("")
  messageScopeRef.current = `${origin}:${selectedId}:${revision}`

  const refresh = useCallback(() => setRevision(value => value + 1), [])

  useEffect(() => {
    let disposed = false
    setLoading(true)
    setError("")
    void rpcRequestForOrigin(origin, "session.list", { limit: 1000, includeClosed: true, includeBackground: true })
      .then(items => {
        if (disposed) return
        setSessions(items)
        setSelectedId(current => items.some(item => item.id === current) ? current : items[0]?.id ?? "")
      })
      .catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [origin, revision])

  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase()
    return sessions.filter(session => (category === "all" || categoryOf(session) === category)
      && (!text || session.title.toLocaleLowerCase().includes(text) || session.id.toLocaleLowerCase().includes(text)))
  }, [sessions, query, category])
  useEffect(() => {
    if (!filtered.some(session => session.id === selectedId)) setSelectedId(filtered[0]?.id ?? "")
  }, [filtered, selectedId])
  const selected = sessions.find(session => session.id === selectedId)

  useEffect(() => {
    let disposed = false
    setMessages([])
    setBefore(null)
    setMessageError("")
    setOlderLoading(false)
    if (!selectedId) return () => { disposed = true }
    setMessagesLoading(true)
    void rpcRequestForOrigin(origin, "message.list", { sessionId: selectedId, limit: 50 })
      .then(page => {
        if (disposed) return
        setMessages(projectMessageEvents(page.items).map(mapMessage))
        setBefore(page.hasMore ? page.nextCursor : null)
      })
      .catch(reason => { if (!disposed) setMessageError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!disposed) setMessagesLoading(false) })
    return () => { disposed = true }
  }, [origin, selectedId, revision])

  const loadOlder = async () => {
    if (!selectedId || !before || olderLoading) return
    const requestedId = selectedId
    const requestedScope = messageScopeRef.current
    setOlderLoading(true)
    setMessageError("")
    try {
      const page = await rpcRequestForOrigin(origin, "message.list", { sessionId: requestedId, before, limit: 50 })
      if (messageScopeRef.current !== requestedScope) return
      const older = projectMessageEvents(page.items).map(mapMessage)
      setMessages(current => [...older.filter(item => !current.some(existing => existing.id === item.id)), ...current])
      setBefore(page.hasMore ? page.nextCursor : null)
    } catch (reason) {
      if (messageScopeRef.current === requestedScope) setMessageError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (messageScopeRef.current === requestedScope) setOlderLoading(false)
    }
  }

  return <div className="theme-page flex h-screen min-h-0 bg-bg text-text">
    <ActivityRail {...navigation} active="allSessions" onOpenFiles={onBack} onOpenSessions={onBack} onOpenAllSessions={refresh} />
    <aside className="flex w-[23vw] min-w-[280px] max-w-[390px] shrink-0 flex-col border-r border-border bg-card/35">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">所有会话</h1>
          <button type="button" onClick={refresh} aria-label="刷新所有会话" title="刷新" className="rounded-lg p-2 text-text-muted hover:bg-card hover:text-text"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-xs text-text-muted">当前世界 · 当前账号 · 已删除会话不显示</p>
        <label className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-text-muted">
          <Search className="h-4 w-4 shrink-0" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题或会话 ID" className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none" />
        </label>
        <select aria-label="筛选会话类型" value={category} onChange={event => setCategory(event.target.value as Category)} className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm">
          {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && <p className="p-3 text-sm text-text-muted">正在读取会话…</p>}
        {error && <p role="alert" className="p-3 text-sm text-danger">{error}</p>}
        {!loading && !error && !filtered.length && <p className="p-3 text-sm text-text-muted">没有匹配的会话</p>}
        {filtered.map(session => <button key={session.id} type="button" onClick={() => setSelectedId(session.id)}
          className={`mb-1 w-full rounded-lg border-l-2 px-3 py-3 text-left hover:bg-card ${selectedId === session.id ? "border-accent bg-accent/8" : "border-transparent"}`}>
          <span className="block truncate text-sm font-medium">{session.title || "新会话"}</span>
          <span className="mt-1 flex items-center gap-2 text-xs text-text-muted">
            <span>{categoryLabels[categoryOf(session)]}</span><span>·</span><span>{session.status === "closed" ? "已关闭" : "进行中"}</span>
          </span>
          <span className="mt-1 block text-xs text-text-lighter">{formatLocalDateTime(session.updatedAt)}</span>
        </button>)}
      </div>
      <div className="border-t border-border px-4 py-2 text-xs text-text-muted">{filtered.length} 条{sessions.length >= 1000 ? " · 当前最多显示 1000 条" : ""}</div>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-16 items-center gap-3 border-b border-border px-6">
        <button type="button" onClick={onBack} className="rounded-lg p-2 text-text-muted hover:bg-card hover:text-text" aria-label="返回聊天"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0"><h2 className="truncate font-medium">{selected?.title || "选择会话"}</h2>
          {selected && <p className="truncate text-xs text-text-muted">{categoryLabels[categoryOf(selected)]} · {selected.status === "closed" ? "已关闭" : "进行中"} · {selected.id}</p>}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {!selected && <p className="text-sm text-text-muted">从左侧选择会话查看消息。</p>}
        {selected && <div className="mx-auto max-w-3xl space-y-4">
          {before && <button type="button" onClick={() => void loadOlder()} disabled={olderLoading} className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:bg-card disabled:opacity-50">{olderLoading ? "正在读取…" : "加载更早消息"}</button>}
          {messagesLoading && <p className="text-sm text-text-muted">正在读取消息…</p>}
          {messageError && <p role="alert" className="text-sm text-danger">{messageError}</p>}
          {!messagesLoading && !messageError && !messages.length && <p className="text-sm text-text-muted">该会话暂无消息。</p>}
          {messages.map(message => <article key={message.id} className="rounded-xl border border-border bg-card/65 p-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-text-muted"><span>{message.role === "user" ? "用户" : message.role === "assistant" ? "智能体" : message.role}</span><span>{message.timestamp}</span></div>
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content || (message.toolCalls?.length ? `工具调用：${message.toolCalls.map(tool => tool.name).join("、")}` : "非文本消息")}</div>
          </article>)}
        </div>}
      </div>
    </main>
  </div>
}
