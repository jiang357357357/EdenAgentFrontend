import { speechStreamKey } from './tts-text'
interface Group { messageId: string; groupIndex: number; streamKey: string }
interface Segment { messageId: string; streamEpoch?: number }
/** Epoch changes also invalidate old reservations when a caller omits the separate revision list. */
export function obsoleteSpeechMessages(groups: Iterable<Group>, segments: readonly Segment[]) {
  const indexes = new Map<string, number>(), current = new Map<string, string>()
  for (const segment of segments) {
    const index = indexes.get(segment.messageId) ?? 0
    indexes.set(segment.messageId, index + 1)
    current.set(`${segment.messageId}:${index}`, speechStreamKey(segment.messageId, index, segment.streamEpoch))
  }
  const obsolete = new Set<string>()
  for (const group of groups) {
    const key = current.get(`${group.messageId}:${group.groupIndex}`)
    if (key && key !== group.streamKey) obsolete.add(group.messageId)
  }
  return obsolete
}
