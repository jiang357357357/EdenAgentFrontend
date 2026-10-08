import { useEffect, useState, useSyncExternalStore } from 'react'
import { getRuntimeOriginRevision } from './runtime-origin'
import { observeSessionEvents, rpcRequest, subscribeSessionChannelStatus } from './rpc-transport'
import { replyTimerDurations, replyTimerElapsed, watchReplyTimer, type ReplyTimerView } from './reply-timer'

function subscribeIdentity(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === 'agent.auth_token' || event.key === 'agent.runtime_origin') listener()
  }
  window.addEventListener('edenagent:account-changed', listener)
  window.addEventListener('edenagent:runtime-origin-changed', listener)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener('edenagent:account-changed', listener)
    window.removeEventListener('edenagent:runtime-origin-changed', listener)
    window.removeEventListener('storage', storage)
  }
}

export function useReplyTimer(sessionId?: string) {
  const revision = useSyncExternalStore(subscribeIdentity, getRuntimeOriginRevision, () => 0)
  const key = `${revision}:${sessionId ?? ''}`
  const [value, setValue] = useState<{ key: string; view: ReplyTimerView }>()
  const [now, setNow] = useState(0)
  const view = value?.key === key ? value.view : undefined
  const running = view?.snapshot?.turn?.outcome === 'running'
  useEffect(() => {
    if (!sessionId) return
    return watchReplyTimer(sessionId, {
      read: () => rpcRequest('session.timing.read', { sessionId }),
      events: observeSessionEvents,
      status: subscribeSessionChannelStatus,
      now: () => performance.now(),
      changed: next => { setValue({ key, view: next }); setNow(performance.now()) },
    })
  }, [key, sessionId])
  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(() => setNow(performance.now()), 1000)
    return () => window.clearInterval(interval)
  }, [running, key])
  return { view, running, elapsedMs: view ? replyTimerElapsed(view, now) : 0,
    durations: view ? replyTimerDurations(view, now) : undefined }
}
