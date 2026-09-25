import { AlignLeft, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { rpcRequest } from "../../lib/rpc-transport"
import { getRuntimeOriginRevision } from "../../lib/runtime-origin"
import { cn } from "../../lib/utils"

type Length = "short" | "medium" | "long"
type Character = { id: string; name: string }
const choices = [
  { value: "short" as const, label: "少", description: "简短回答，通常一两段" },
  { value: "medium" as const, label: "中", description: "自然展开，说明必要内容" },
  { value: "long" as const, label: "多", description: "详细解释，按需补充例子" },
]

export function ReplyLengthControls({ characters }: { characters: Character[] }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState("")
  const [length, setLength] = useState<Length>("medium")
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const sequence = useRef(0)
  const character = characters.find(item => item.id === selected) ?? characters[0]
  const id = character?.id
  const revision = getRuntimeOriginRevision()
  useEffect(() => {
    const request = ++sequence.current
    setReady(false); setBusy(false); setError(""); setLength("medium")
    if (!open || !id) return
    void rpcRequest("ui.reply_length.get", { characterId: id }).then(result => {
      if (request !== sequence.current || revision !== getRuntimeOriginRevision()) return
      setLength(result.length); setReady(true)
    }).catch(reason => { if (request === sequence.current) setError(`读取失败：${String(reason)}`) })
    return () => { sequence.current++ }
  }, [id, open, revision])
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    window.addEventListener("pointerdown", close); window.addEventListener("keydown", escape)
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape) }
  }, [open])
  const change = async (next: Length) => {
    if (!id || !ready || busy) return
    const request = sequence.current
    setBusy(true); setError("")
    try {
      const result = await rpcRequest("ui.reply_length.update", { characterId: id, length: next })
      if (request === sequence.current && revision === getRuntimeOriginRevision()) setLength(result.length)
    } catch (reason) { if (request === sequence.current) setError(`保存失败：${String(reason)}`) }
    finally { if (request === sequence.current) setBusy(false) }
  }
  return <div ref={root} className="relative">
    <button type="button" onClick={() => setOpen(value => !value)} aria-label="调整回复长度" title="回复长度" aria-expanded={open}
      className={cn("flex h-8 w-8 items-center justify-center rounded-md transition-colors", open ? "bg-card text-accent shadow-sm" : "text-text-muted hover:bg-bg hover:text-text")}>
      <AlignLeft className="h-4 w-4" />
    </button>
    {open && <div role="dialog" aria-label="回复长度" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 max-w-[90vw] rounded-xl border border-border bg-card p-4 text-text shadow-xl">
      <div className="mb-3 flex items-center justify-between"><span className="text-sm font-medium">回复长度</span><button type="button" onClick={() => setOpen(false)} aria-label="关闭回复长度设置" className="rounded p-1 text-text-muted hover:bg-bg"><X className="h-4 w-4" /></button></div>
      {characters.length > 1 ? <select aria-label="选择角色" value={id} onChange={event => setSelected(event.target.value)} className="mb-3 w-full rounded border border-border bg-card p-2 text-sm">{characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <p className="mb-3 text-sm text-text-muted">{character?.name ?? "请先选择会话角色"}</p>}
      <div className="space-y-2" role="group" aria-label="回复长度选项">{choices.map(item => <button key={item.value} type="button" disabled={!ready || busy} aria-pressed={ready && length === item.value} onClick={() => void change(item.value)}
        className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left disabled:opacity-50", length === item.value && ready ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-bg")}>
        <span className="font-medium">{item.label}</span><span className="text-xs text-text-muted">{item.description}</span>
      </button>)}</div>
      {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      <p className="mt-3 text-xs leading-relaxed text-text-muted">按角色保存，从下一条聊天回复生效。本轮提出的长度要求优先。</p>
    </div>}
  </div>
}
