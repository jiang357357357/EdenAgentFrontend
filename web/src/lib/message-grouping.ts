import type { MessageData } from "../types"

export type MessageGroupPosition = "single" | "first" | "middle" | "last"

function speakerIdentity(message: MessageData): string | undefined {
  const speaker = message.speaker
  if (speaker?.assistantID !== undefined && speaker.assistantID !== null) {
    return `assistant:${String(speaker.assistantID)}`
  }
  if (speaker?.characterID !== undefined && speaker.characterID !== null) {
    return `character:${String(speaker.characterID)}`
  }
  const name = speaker?.assistantName || speaker?.characterName
  return name ? `name:${name}` : undefined
}

export function messagesShareAssistantGroup(left?: MessageData, right?: MessageData) {
  if (!left || !right || left.role !== "assistant" || right.role !== "assistant") return false
  const leftSpeaker = speakerIdentity(left)
  const rightSpeaker = speakerIdentity(right)

  // Part events can create an assistant message before its message.updated event
  // supplies runID and speaker. Keep that temporary shell in the adjacent group so
  // it does not flash a second avatar while the metadata catches up.
  if (leftSpeaker && rightSpeaker && leftSpeaker !== rightSpeaker) return false
  if (left.runID && right.runID && left.runID !== right.runID) return false

  // Legacy messages and React state retained across a development hot reload
  // do not contain runID. Adjacent assistant messages that do not have conflicting
  // metadata are phases of the same visible response.
  return true
}

export function shouldShowOrganizingReply(message: MessageData) {
  if (message.role !== "assistant" || !message.isStreaming || message.error) return false
  if (message.content?.trim()) return false
  if (message.segments?.length) return false
  if (message.runtimeTrace?.trim() || message.thinking?.trim()) return false
  if (message.toolCalls?.length || message.metaParts?.length || message.images?.length) return false
  return true
}

export function messageGroupPosition(messages: MessageData[], index: number): MessageGroupPosition {
  const message = messages[index]
  if (!message || message.role !== "assistant") return "single"
  const joinsPrevious = messagesShareAssistantGroup(messages[index - 1], message)
  const joinsNext = messagesShareAssistantGroup(message, messages[index + 1])
  if (joinsPrevious && joinsNext) return "middle"
  if (joinsPrevious) return "last"
  if (joinsNext) return "first"
  return "single"
}

export function messageRenderKey(messages: MessageData[], index: number): string {
  const message = messages[index]
  if (!message || message.role !== "assistant") return `message:${message?.id ?? index}`

  let precedingUserRenderKey: string | undefined
  let firstAssistantIndex = -1
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor]
    if (candidate?.role === "user") {
      precedingUserRenderKey = candidate.renderKey ?? candidate.id
      break
    }
    if (candidate?.role === "assistant") firstAssistantIndex = cursor
  }

  // The first assistant node of a turn deliberately does not use its transient
  // message ID. The understanding shell and the first server message can then
  // share the same React component and avatar DOM for the whole turn.
  if (precedingUserRenderKey && firstAssistantIndex === index) {
    return `assistant-turn:${precedingUserRenderKey}`
  }
  return `message:${message.id}`
}
