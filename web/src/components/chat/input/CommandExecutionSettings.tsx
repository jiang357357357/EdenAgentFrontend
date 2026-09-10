// 沙箱设置已暂停；需开发者审阅后才能重新加入。原界面保存在 Archive/2026-09-10-sandbox-paused。
import { useEffect, useState } from "react"
import type { CommandExecutionInfo } from "@eden/api"
import { rpcRequestForOrigin } from "../../../lib/rpc-transport"

import { useRuntimeOrigin } from '../../../lib/use-runtime-origin'
import { getStoredRuntimeOrigin } from '../../../lib/runtime-origin'

export function CommandExecutionSettings() {
  const origin = useRuntimeOrigin()
  return <ScopedCommandExecutionSettings key={origin} />
}
function ScopedCommandExecutionSettings() {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [current, setCurrent] = useState<CommandExecutionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    rpcRequestForOrigin(origin, "command.execution.get", {})
      .then((info) => { if (active) setCurrent(info) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload, origin])

  return (
    <section className="border-t border-current/15 px-3 py-3 text-xs" aria-label="终端执行边界">
      <p className="mb-2 font-medium">终端执行边界 · {origin === 'mon' ? '伊甸园' : '尘世'}</p>
      {loading && <p role="status">正在检查终端…</p>}
      {error && <p role="alert" className="mb-2 text-red-500">{error}</p>}
      {!loading && !current && (
        <button type="button" className="underline" onClick={() => setReload((value) => value + 1)}>重新读取</button>
      )}
      {!loading && current && (
        <div className="space-y-2">
          {current.sandboxBackend !== "disabled" ? (
            <p role="status">服务仍使用旧执行策略，请重启服务以应用本机执行模式。</p>
          ) : <>
            <p role="status">当前：本机执行 · {current.shell} · {current.available ? "可用" : "不可用"}</p>
            <p className="leading-relaxed opacity-80">{current.available ? "本机执行已启用，使用当前系统账户权限。" : "本机执行暂不可用，请检查系统 Shell。"}</p>
          </>}
        </div>
      )}
    </section>
  )
}
