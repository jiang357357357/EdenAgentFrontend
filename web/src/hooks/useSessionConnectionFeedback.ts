import { useCallback, useEffect, useRef, useState } from 'react'
import { ConnectionFeedback, type ConnectionFeedbackState } from '../lib/connection-feedback'
import { subscribeSessionChannelStatus, retainSessionChannels } from '../lib/rpc-transport'

/** Recovery belongs to the failed conversation; switching tabs selects its own feedback. */
export function useSessionConnectionFeedback(enabled: boolean, epoch: number, activeSessionId: string | undefined,
  restore: (sessionId: string, current: () => boolean) => Promise<void>) {
  const [states, setStates] = useState<Record<string, ConnectionFeedbackState>>({})
  const controllers = useRef(new Map<string, ConnectionFeedback>())
  const restoreRef = useRef(restore)
  restoreRef.current = restore
  const synchronize = useCallback(async (sessionId: string, controller: ConnectionFeedback, revision: number, live: () => boolean = () => true) => {
    const current = () => live() && controllers.current.get(sessionId) === controller && controller.isCurrent(revision)
    try { await restoreRef.current(sessionId, current); if (current()) controller.synchronized(revision) }
    catch (error) { if (current()) controller.synchronized(revision, error instanceof Error ? error.message : String(error)) }
  }, [])
  useEffect(() => {
    controllers.current.clear()
    setStates({})
    if (!enabled) return
    let disposed = false
    const dispose = subscribeSessionChannelStatus(status => {
      if (disposed) return
      let controller = controllers.current.get(status.sessionId)
      if (!controller) {
        controller = new ConnectionFeedback(state => {
          if (!disposed) setStates(values => ({ ...values, [status.sessionId]: state }))
        })
        controllers.current.set(status.sessionId, controller)
      }
      if (!status.connected) { controller.disconnected(status.error ?? '此会话连接中断'); return }
      controller.opened()
      const revision = controller.synchronizing()
      void synchronize(status.sessionId, controller, revision, () => !disposed)
    })
    return () => { disposed = true; dispose(); controllers.current.clear() }
  }, [enabled, epoch, synchronize])
  useEffect(() => { retainSessionChannels(activeSessionId) }, [activeSessionId])
  const retry = useCallback(() => {
    const controller = activeSessionId ? controllers.current.get(activeSessionId) : undefined
    if (controller && activeSessionId) void synchronize(activeSessionId, controller, controller.synchronizing())
  }, [activeSessionId, synchronize])
  const dismiss = useCallback(() => {
    if (activeSessionId) controllers.current.get(activeSessionId)?.dismiss()
  }, [activeSessionId])
  return { feedback: activeSessionId ? states[activeSessionId] : undefined, states, retry, dismiss }
}
