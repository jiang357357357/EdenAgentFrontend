import { rpcNotifications } from '@eden/api'
import { EdenAgentRpcClient, type RpcCloseInfo } from './rpc-client'
import { connectionCloseMessage } from './connection-diagnostics'
import type { SessionEventInput } from './session-event'

export type SessionChannelStatus = { sessionId: string; connected: boolean; error?: string }
type Channel = {
  id: string; client?: EdenAgentRpcClient; opening?: EdenAgentRpcClient; pending?: Promise<EdenAgentRpcClient>
  sequence?: string; timer?: ReturnType<typeof setTimeout>; attempts: number; generation: number
  status: SessionChannelStatus; lastUsed: number; busy: boolean
}
type Access = {
  connect(client: EdenAgentRpcClient, sessionId: string, afterSeq?: string): Promise<unknown>
  event(event: SessionEventInput): void
  status(status: SessionChannelStatus): void
}

/** Independent sockets, cursors and retry timers; a failure never closes a sibling channel. */
export class SessionRpcChannels {
  private readonly channels = new Map<string, Channel>()
  private active = true
  constructor(private readonly access: Access) {}

  snapshot(): SessionChannelStatus[] { return [...this.channels.values()].map(channel => channel.status) }
  owns(sessionId: string, client: EdenAgentRpcClient): boolean { return this.channels.get(sessionId)?.client === client }
  activity(sessionId: string, busy: boolean): void {
    const channel = this.channels.get(sessionId)
    if (channel) channel.busy = busy
  }

  ensure(sessionId: string, afterSeq?: string): Promise<EdenAgentRpcClient> {
    if (!this.active) return Promise.reject(new Error('Session channels have been disposed'))
    let channel = this.channels.get(sessionId)
    if (!channel) {
      channel = { id: sessionId, sequence: afterSeq, attempts: 0, generation: 0,
        status: { sessionId, connected: false }, lastUsed: Date.now(), busy: false }
      this.channels.set(sessionId, channel)
    }
    channel.lastUsed = Date.now()
    if (channel.client) return Promise.resolve(channel.client)
    if (channel.pending) return channel.pending
    if (channel.timer) clearTimeout(channel.timer)
    channel.timer = undefined
    return this.open(channel)
  }

  forget(sessionId: string): void {
    const channel = this.channels.get(sessionId)
    if (!channel) return
    this.channels.delete(sessionId)
    channel.generation++
    clearTimeout(channel.timer)
    channel.client?.close()
    channel.opening?.close()
  }

  /** Keep current/busy conversations live; old idle views can be restored on demand. */
  retain(activeSessionId?: string): void {
    for (const channel of this.channels.values()) {
      if (channel.id !== activeSessionId && !channel.busy && Date.now() - channel.lastUsed > 5 * 60_000)
        this.forget(channel.id)
    }
  }

  dispose(): void {
    this.active = false
    for (const id of [...this.channels.keys()]) this.forget(id)
  }

  private current(channel: Channel, generation: number): boolean {
    return this.active && this.channels.get(channel.id) === channel && channel.generation === generation
  }

  private report(channel: Channel, connected: boolean, error?: string): void {
    channel.status = { sessionId: channel.id, connected, ...(error ? { error } : {}) }
    this.access.status(channel.status)
  }

  private retry(channel: Channel): void {
    if (!this.active || channel.timer || this.channels.get(channel.id) !== channel) return
    channel.timer = setTimeout(() => {
      channel.timer = undefined
      void this.ensure(channel.id).catch(() => {}) // open reports failure and schedules this channel only.
    }, Math.min(500 * 2 ** channel.attempts++, 10_000))
  }

  private open(channel: Channel): Promise<EdenAgentRpcClient> {
    const generation = ++channel.generation
    const client = new EdenAgentRpcClient()
    channel.opening = client
    let closed: RpcCloseInfo | undefined
    const current = () => this.current(channel, generation)
    client.onClose(info => {
      closed = info
      if (!current() || channel.client !== client) return
      channel.client = undefined
      channel.pending = undefined
      this.report(channel, false, connectionCloseMessage(info))
      this.retry(channel)
    })
    client.on('session.event', raw => {
      if (!current()) return
      const parsed = rpcNotifications['session.event'].safeParse(raw)
      if (!parsed.success || parsed.data.sessionId !== channel.id) {
        client.close({ code: 1000, reason: 'invalid session event' }); return
      }
      const event = parsed.data
      if (channel.sequence !== undefined) {
        if (BigInt(event.seq) <= BigInt(channel.sequence)) return
        if (BigInt(event.seq) !== BigInt(channel.sequence) + 1n) {
          client.close({ code: 1000, reason: 'event sequence gap' }); return
        }
      }
      channel.sequence = event.seq
      channel.lastUsed = Date.now()
      if (event.eventType === 'turn.started' || event.eventType === 'input.queued') channel.busy = true
      if (['turn.completed', 'turn.failed', 'session.closed', 'session.deleted'].includes(event.eventType)) channel.busy = false
      this.access.event(event)
    })
    client.on('server.warning', raw => {
      if (!current()) return
      const value = rpcNotifications['server.warning'].safeParse(raw)
      if (!value.success || value.data.code === 'event_stream_lagged')
        client.close({ code: 1000, reason: 'event stream lagged' })
    })
    const pending = this.access.connect(client, channel.id, channel.sequence).then(() => {
      if (!current() || closed) throw new Error(closed ? connectionCloseMessage(closed) : 'Session scope changed during initialization')
      channel.client = client
      channel.opening = undefined
      channel.pending = undefined
      channel.attempts = 0
      this.report(channel, true)
      return client
    }).catch(error => {
      client.close()
      if (current()) {
        channel.client = undefined
        channel.opening = undefined
        channel.pending = undefined
        this.report(channel, false, closed ? connectionCloseMessage(closed) : String(error instanceof Error ? error.message : error))
        this.retry(channel)
      }
      throw error
    })
    channel.pending = pending
    return pending
  }
}
