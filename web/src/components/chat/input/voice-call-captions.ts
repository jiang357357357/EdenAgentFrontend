import { textForTTS } from '@eden/api'
import type { MessageData } from '../../../types'

export type VoiceCallGreeting = { messageId: string; text: string; receivedAt: number }
export type VoiceCallPlayback = { messageId: string; text: string }
export type VoiceCallCaption = { id: string; speaker: string; text: string }

function speakerName(message: MessageData | undefined, assistantName: string) {
  return message?.role === 'user' ? '你' : message?.speaker?.characterName || message?.speaker?.assistantName || assistantName
}

export function voiceCallCaptions(messages: readonly MessageData[], assistantName: string, greeting: VoiceCallGreeting | null,
  userSpeech: string, playback: VoiceCallPlayback | undefined) {
  const lines: VoiceCallCaption[] = []
  const messageIndex = greeting ? messages.findIndex(message => message.id === greeting.messageId) : -1
  const greetingMessage = messageIndex >= 0 ? messages[messageIndex] : undefined
  if (greeting) {
    lines.push({ id: greeting.messageId, speaker: speakerName(greetingMessage, assistantName), text: greeting.text })
    const recent = messages.slice(Math.max(0, messageIndex + 1, messages.length - 18))
    for (const message of recent) {
      if (messageIndex < 0 && !(Date.parse(message.timestamp) >= greeting.receivedAt)) continue
      if ((message.role !== 'user' && message.role !== 'assistant') || message.isStreaming || message.deliveryState === 'failed') continue
      const text = message.role === 'assistant' ? textForTTS(message.content, 'text_only') : message.content.trim()
      if (text) lines.push({ id: message.id, speaker: speakerName(message, assistantName), text })
    }
  }

  const playingText = playback && textForTTS(playback.text, 'text_only')
  if (playback && playingText) {
    const position = lines.findIndex(line => line.id === playback.messageId)
    const history = position >= 0 ? lines.slice(0, position) : lines
    const message = messages.find(item => item.id === playback.messageId)
    return { history: history.slice(-2), current: { id: playback.messageId, speaker: speakerName(message, assistantName), text: playingText } }
  }

  const top = lines.at(-1)
  const liveText = userSpeech.trim()
  if (liveText && !(top?.speaker === '你' && top.text === liveText)) {
    return { history: lines.slice(-2), current: { id: 'microphone', speaker: '你', text: liveText } }
  }
  return { history: lines.slice(-3, -1), current: top }
}
