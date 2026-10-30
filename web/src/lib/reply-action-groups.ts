import type { MessageData } from "../types"
import { messagesShareAssistantGroup } from "./message-grouping"
import { replyCopyText } from "./reply-copy"

export interface ReplyActionGroup {
  messageIDs: string[]
  text: string
  durationMs?: number
  pending: boolean
  copyAvailable: boolean
}

/** Only the last message owns actions; the server resolves any unloaded prefix for copy/delete. */
export function buildReplyActionGroups(messages: MessageData[], pendingLatest = false, missingPrefix = false) {
  const groups = new Map<string, ReplyActionGroup>()
  for (let start = 0; start < messages.length;) {
    const first = messages[start]!
    if (first.role !== "assistant") { start++; continue }
    let end = start + 1
    while (end < messages.length && messagesShareAssistantGroup(messages[end - 1], messages[end])) end++
    const members = messages.slice(start, end)
    const text = members.map(replyCopyText).filter(value => value.trim()).join("\n\n")
    const durations = members.flatMap(value => typeof value.replyDurationMs === "number" && Number.isFinite(value.replyDurationMs) ? [value.replyDurationMs] : [])
    groups.set(members.at(-1)!.id, {
      messageIDs: members.map(value => value.id), text,
      ...(durations.length ? { durationMs: Math.max(...durations) } : {}),
      pending: members.some(value => value.isStreaming) || pendingLatest && end === messages.length,
      copyAvailable: Boolean(text.trim()) || missingPrefix && start === 0,
    })
    start = end
  }
  return groups
}
