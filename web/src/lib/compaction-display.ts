import type { RuntimeCompactionPart, RuntimeMessage } from '../types'

export function isCompactionMessage(id: string) {
  return id.startsWith('compaction:') || id.startsWith('compaction-progress:')
}

type Position = { sequence?: bigint; time?: number; index: number }
function position(message: RuntimeMessage, part: RuntimeCompactionPart, index: number): Position {
  const sequence = part.eventSequence && /^\d+$/.test(part.eventSequence) ? BigInt(part.eventSequence) : undefined
  return { sequence, time: message.createdAt, index }
}
function atOrAfter(left: Position, right: Position) {
  if (left.sequence !== undefined && right.sequence !== undefined) return left.sequence >= right.sequence
  if (left.time !== undefined && right.time !== undefined && left.time !== right.time) return left.time > right.time
  return left.index >= right.index
}

/** Keep the durable events intact; a result supersedes only older progress from the same turn. */
export function supersededCompactionProgress(messages: RuntimeMessage[]): Set<string> {
  const results = new Map<string | undefined, Position>()
  const progress: { id: string; turn?: string; position: Position }[] = []
  messages.forEach((message, index) => {
    if (!isCompactionMessage(message.id)) return
    for (const id of message.partOrder) {
      const part = message.parts[id]
      if (part?.type !== 'compaction') continue
      const compaction = part as RuntimeCompactionPart, point = position(message, compaction, index)
      if (compaction.progress || message.id.startsWith('compaction-progress:'))
        progress.push({ id: message.id, turn: message.turnID, position: point })
      else if (typeof compaction.summary === 'string') {
        const previous = results.get(message.turnID)
        if (!previous || atOrAfter(point, previous)) results.set(message.turnID, point)
      }
    }
  })
  return new Set(progress.filter(item => {
    const result = results.get(item.turn)
    return result && atOrAfter(result, item.position)
  }).map(item => item.id))
}

/** Updating a turn's progress reuses its ID; place its latest attempt at its current event position. */
export function compactionDisplayOrder(messages: RuntimeMessage[]): RuntimeMessage[] {
  const hidden = supersededCompactionProgress(messages)
  const visible = messages.filter(message => !hidden.has(message.id))
  const indices = new Map(messages.map((message, index) => [message, index]))
  const point = (message: RuntimeMessage): Position => {
    const part = message.partOrder.map(id => message.parts[id]).find(part => part?.type === 'compaction')
    return part ? position(message, part as RuntimeCompactionPart, indices.get(message)!)
      : { time: message.createdAt, index: indices.get(message)! }
  }
  for (const message of messages.filter(message => message.id.startsWith('compaction-progress:') && !hidden.has(message.id))) {
    visible.splice(visible.indexOf(message), 1)
    let insertion = 0
    visible.forEach((other, index) => { if (atOrAfter(point(message), point(other))) insertion = index + 1 })
    visible.splice(insertion, 0, message)
  }
  return visible
}
