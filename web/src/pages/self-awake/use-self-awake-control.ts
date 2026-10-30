import { useEffect, useRef, useState } from "react"
import { rpcRequest } from "../../lib/rpc-transport"
import type { RpcMethodMap } from "../../lib/rpc-contracts"
import { getErrorMessage } from "../../lib/auth"
import { getRuntimeOriginRevision } from "../../lib/runtime-origin"

type Control = RpcMethodMap["self_awake.control.get"]["result"]

export function useSelfAwakeControl(refreshVersion: number) {
  const [control, setControl] = useState<Control | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [scope, setScope] = useState(getRuntimeOriginRevision)
  const sequence = useRef(0)
  const mutating = useRef(false)
  const reload = useRef<() => void>(() => {})
  const lastRefresh = useRef(refreshVersion)

  useEffect(() => {
    const changed = () => setScope(getRuntimeOriginRevision())
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === "agent.auth_token" || event.key === "agent.runtime_origin") changed()
    }
    window.addEventListener("edenagent:account-changed", changed)
    window.addEventListener("edenagent:runtime-origin-changed", changed)
    window.addEventListener("storage", storage)
    return () => {
      window.removeEventListener("edenagent:account-changed", changed)
      window.removeEventListener("edenagent:runtime-origin-changed", changed)
      window.removeEventListener("storage", storage)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    const current = (request: number) => !disposed && scope === getRuntimeOriginRevision() && request === sequence.current
    ++sequence.current
    mutating.current = false
    setControl(null); setError(""); setSaving(false)
    const read = async () => {
      if (mutating.current) return
      const request = ++sequence.current
      try {
        const result = await rpcRequest("self_awake.control.get", {})
        if (current(request)) { setControl(result); setError("") }
      } catch (cause) {
        if (current(request)) setError(getErrorMessage(cause, "读取自醒开关失败，请刷新重试。"))
      }
    }
    reload.current = () => { void read() }
    void read()
    const timer = window.setInterval(() => {
      setNow(Date.now())
      if (document.visibilityState === "visible") void read()
    }, 15_000)
    const focus = () => { setNow(Date.now()); void read() }
    window.addEventListener("focus", focus)
    return () => {
      disposed = true
      ++sequence.current
      window.clearInterval(timer)
      window.removeEventListener("focus", focus)
      reload.current = () => {}
    }
  }, [scope])

  useEffect(() => {
    if (lastRefresh.current === refreshVersion) return
    lastRefresh.current = refreshVersion
    reload.current()
  }, [refreshVersion])

  const toggle = async () => {
    if (!control || mutating.current || error || scope !== getRuntimeOriginRevision()) return
    mutating.current = true
    const request = ++sequence.current
    const current = () => request === sequence.current && scope === getRuntimeOriginRevision()
    setSaving(true)
    try {
      const result = await rpcRequest("self_awake.control.update", { enabled: !control.enabled, expectedUpdatedAt: control.updatedAt })
      if (current()) { setControl(result); setError("") }
    } catch (cause) {
      if (current()) setError(`开关操作结果未确认，请刷新核对。${getErrorMessage(cause, "保存失败。")}`)
    } finally {
      if (current()) { mutating.current = false; setSaving(false) }
    }
  }

  return { control, error, saving, now, toggle, refresh: () => reload.current() }
}
