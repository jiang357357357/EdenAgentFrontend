import { useEffect, useRef, useState } from "react"
import { X, Download, RefreshCw } from "lucide-react"
import { getSelfAwakeExecution } from "../../lib/agent-client"
import type { SelfAwakeExecutionInfo } from "../../generated/eden-agent-rpc"

type RecordValue = Record<string, unknown>
function object(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}
}
const statuses: Record<string, string> = { completed: "已完成", failed: "失败", running: "运行中", pending: "等待执行" }
const actions: Record<string, string> = { write_diary: "写日记", observe_only: "只观察（历史记录）", chat_user: "主动聊天", remind_user: "提醒用户", create_task: "创建任务", ask_user: "询问用户", run_safe_check: "检查情况", sync_context: "同步上下文" }
const labels: Record<string, string> = {
  "self_awake.started": "开始自醒", "self_awake.failed": "自醒失败",
  "agent.tool_execution_start": "调用工具", "agent.tool_execution_end": "工具返回",
  "turn.completed": "本轮完成", "turn.failed": "本轮失败",
  "self_awake.safe_check": "检查决策（执行情况见工具记录）",
  "self_awake.sync_context": "上下文决策（同步情况见工具记录）",
  "permission.requested": "请求授权", "permission.resolved": "授权结果",
  "self_awake.dispatch_failed": "启动自醒失败", "self_awake.action_applied": "最终动作处理记录",
  "question.requested": "提出问题", "question.resolved": "收到回答",
}

export function SelfAwakeExecutionDialog({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [data, setData] = useState<SelfAwakeExecutionInfo | null>(null)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    close.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key === "Tab") {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary, a[href]')
        if (!nodes?.length) return
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    window.addEventListener("keydown", key)
    return () => { window.removeEventListener("keydown", key); previous?.focus() }
  }, [onClose])
  useEffect(() => {
    let active = true
    setData(null); setError("")
    getSelfAwakeExecution(runId).then(result => { if (active) setData(result) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { active = false }
  }, [runId, refresh])
  const record = object(data?.record)
  const run = object(record.run)
  const decision = object(run.decision)
  const notification = object(record.notificationHistory)
  const events = Array.isArray(record.events) ? record.events.map(object) : []
  const diaries = Array.isArray(run.diaries) ? run.diaries.map(object) : []
  const download = () => {
    if (!data) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(data.record, null, 2)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url; link.download = `self-awake-${runId}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="self-awake-execution-title" className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-card p-6 shadow-xl">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <h2 id="self-awake-execution-title" className="flex-1 text-xl">本次自醒 · 执行记录</h2>
        <button onClick={() => setRefresh(value => value + 1)} title="刷新记录" aria-label="刷新记录"><RefreshCw size={19} /></button>
        <button disabled={!data} onClick={download} title="下载记录" aria-label="下载记录"><Download size={19} /></button>
        <button ref={close} onClick={onClose} aria-label="关闭执行记录"><X /></button>
      </div>
      <div className="overflow-y-auto py-4 space-y-4 text-sm">
        {error ? <p role="alert" className="text-red-600">{error}</p> : !data ? <p>正在读取执行记录…</p> : <>
          <p>状态：{statuses[String(run.status)] ?? String(run.status ?? "未知")} · 尝试 {String(run.attempts ?? 0)} 次 · 调用工具 {String(events.filter(event => event.kind === "agent.tool_execution_start").length)} 次</p>
          <p className="break-all text-text-muted">记录标识：{data.path}</p>
          <p>触发原因：{String(object(object(run.request).trigger).reason ?? "未记录")}</p>
          {diaries.map((diary, index) => <section key={index}><h3 className="font-semibold">{String(diary.title ?? "工作日记")}</h3><p className="mt-2 whitespace-pre-wrap">{String(diary.content ?? "")}</p></section>)}
          {!diaries.length && <p>本轮尚无日记记录。</p>}
          {decision.action != null && <p>行动决策：{actions[String(decision.action)] ?? String(decision.action)}</p>}
          {run.lastError != null && <p className="text-red-600">{String(run.lastError)}</p>}
          {notification.state != null && <section className="rounded border border-border p-3">
            <h3 className="font-semibold">联系用户</h3>
            <p>发送状态：{({ delivered: "渠道已接收", pending: "等待发送或重试", failed: "发送失败", suppressed: "本次未发送" } as Record<string, string>)[String(notification.state)] ?? String(notification.state)}</p>
            <p className="whitespace-pre-wrap">{String(object(decision.action_payload).message ?? "")}</p>
            <p>渠道：{String(object(notification.result).deliveredChannel ?? object(decision.action_payload).channel ?? "未记录")} · 渠道接收不代表用户已读。</p>
            {object(notification.result).desktopWindow != null && <p>提醒窗口：{({ open: "已打开，等待关闭", closed: "已关闭", failed: "窗口异常退出", unknown: "后端已重启，窗口状态未知" } as Record<string, string>)[String(object(object(notification.result).desktopWindow).state)] ?? "状态未知"} · 关闭不代表已阅读。</p>}
            <details><summary className="cursor-pointer">查看渠道尝试和结果</summary><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(notification, null, 2)}</pre></details>
          </section>}
          {Array.isArray(record.desktopReminders) && record.desktopReminders.length > 0 && <section className="rounded border border-border p-3">
            <h3 className="font-semibold">桌面提醒工具</h3>
            {record.desktopReminders.map((item: unknown) => { const reminder=object(item); return <div key={String(reminder.id)} className="py-2">
              <p>{String(reminder.title)} · {({launching:"正在打开",open:"等待关闭",closed:"已关闭",failed:"打开失败",unknown:"状态未知"} as Record<string,string>)[String(reminder.state)] ?? String(reminder.state)}</p>
              <p className="whitespace-pre-wrap">{String(reminder.message)}</p>
              <p className="text-xs text-text-muted">关闭不代表已阅读。</p>
            </div> })}
          </section>}
          <h3 className="font-semibold">实际执行过程</h3>
          {!events.some(event => event.kind === "agent.tool_execution_start") && <p className="text-text-muted">本轮没有调用工具。</p>}
          {events.map((event, index) => <details key={String(event.id ?? index)} className="rounded border border-border p-3">
            <summary className="cursor-pointer">{new Date(Number(event.createdAt)).toLocaleString()} · {labels[String(event.kind)] ?? String(event.kind)} {String(object(event.payload).toolName ?? "")}</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(event.payload, null, 2)}</pre>
          </details>)}
          <p className="text-xs text-text-muted">{String(record.recordNote ?? "")}</p>
        </>}
      </div>
    </div>
  </div>
}
