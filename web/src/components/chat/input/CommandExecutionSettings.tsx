import { useEffect, useState } from "react"
import type { CommandExecutionInfo, CommandExecutionConfig } from "@eden/api"
type CommandExecutionMode = CommandExecutionConfig["mode"]
import { rpcRequestWithTimeout } from "../../../lib/rpc-transport"

export function CommandExecutionSettings() {
  const [current, setCurrent] = useState<CommandExecutionInfo | null>(null)
  const [mode, setMode] = useState<CommandExecutionMode>("sandbox")
  const [network, setNetwork] = useState(false)
  const [roots, setRoots] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)

  function accept(info: CommandExecutionInfo) {
    setCurrent(info)
    setMode(info.mode)
    setNetwork(info.networkAccess)
    setRoots(info.writableRoots.join("\n"))
    setConfirmed(false)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    rpcRequestWithTimeout("command.execution.get", {}, 10_000)
      .then((info) => { if (active) accept(info) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  async function save() {
    if (saving || !current || (mode === "host" && !confirmed)) return
    setSaving(true)
    setError("")
    try {
      accept(await rpcRequestWithTimeout("command.execution.set", {
        mode,
        confirmHostExecution: mode === "host" && confirmed,
        networkAccess: network,
        writableRoots: roots.split("\n").map((root) => root.trim()).filter(Boolean),
      }, 15_000))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      // A timed-out mutation may have committed. Reload before another write.
      setCurrent(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border-t border-current/15 px-3 py-3 text-xs" aria-label="终端执行边界">
      <p className="mb-2 font-medium">终端执行边界 · 当前世界</p>
      {loading && <p role="status">正在检查终端…</p>}
      {error && <p role="alert" className="mb-2 text-red-500">{error}</p>}
      {!loading && !current && (
        <button type="button" className="underline" onClick={() => setReload((value) => value + 1)}>重新读取</button>
      )}
      {!loading && current && (
        <fieldset disabled={saving} className="space-y-2 disabled:opacity-60">
          <p role="status" className="leading-relaxed opacity-80">
            当前：{current.mode === "host" ? "本机执行" : "沙箱执行"} · {current.shell} · {current.available ? "可用" : "不可用"}
          </p>
          <p className="leading-relaxed opacity-75">{current.detail}</p>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "sandbox"} onChange={() => { setMode("sandbox"); setConfirmed(false) }} />
            沙箱执行（默认）
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "host"} onChange={() => { setMode("host"); setConfirmed(false) }} />
            本机执行
          </label>
          {mode === "host" ? (
            <label className="flex items-start gap-2 leading-relaxed">
              <input className="mt-0.5" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              我允许使用当前系统账户执行命令，可访问工作区外文件、另一世界目录和网络。上方审批策略仍生效。
            </label>
          ) : current.sandboxBackend === "bubblewrap" ? (
            <>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={network} onChange={(event) => setNetwork(event.target.checked)} />
                允许沙箱命令联网
              </label>
              <label className="block">
                额外可写目录（绝对路径，每行一个）
                <textarea value={roots} onChange={(event) => setRoots(event.target.value)} rows={2}
                  className="mt-1 w-full rounded border border-current/20 bg-transparent p-1.5" />
              </label>
            </>
          ) : <p className="opacity-75">外部隔离器的网络和目录权限由其自身配置控制。</p>}
          <p className="opacity-75">设置保存在当前世界；运行中的终端进程结束后才能切换。本机执行不会自动开启 MCP 或技能代码执行。</p>
          <button type="button" disabled={saving || (mode === "host" && !confirmed)} onClick={() => void save()}
            className="rounded border border-current/25 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "正在应用…" : "应用执行设置"}
          </button>
        </fieldset>
      )}
    </section>
  )
}
