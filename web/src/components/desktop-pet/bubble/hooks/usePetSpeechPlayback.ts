import { useMemo } from "react"

import { useTTSSpeech, type SpeechSegment } from "../../../../hooks/useTTSSpeech"
import type { PetTTSMode } from "../../../../lib/desktop-window"
import type { MessageData } from "../../../../types"

interface PetSpeechPlaybackOptions {
  audioOutputDeviceId?: string
  isThinking: boolean
  latestAssistantMessage?: MessageData
  sessionId?: string
  ttsConfigId?: number | null
  ttsMode: PetTTSMode
  speechVolume?: number
  speechRate?: number
}

function messageSpeechSegments(message: MessageData | undefined, fallbackConfigId?: number | null): SpeechSegment[] {
  if (!message) return []
  const configId = message.speaker?.ttsConfigID ?? fallbackConfigId
  const streamEpoch = message.speechEpoch ?? 0
  if (message.segments?.length) {
    return message.segments.flatMap((segment) => segment.type === "text" && segment.content.trim()
      ? [{
          id: segment.id,
          messageId: message.id,
          text: segment.content,
          state: segment.state,
          streamEpoch,
          streamResetReason: message.speechResetReason,
          configId,
        }]
      : [])
  }
  return message.content.trim()
    ? [{
        id: `${message.id}:content`,
        messageId: message.id,
        text: message.content,
        state: message.isStreaming ? "streaming" : "done",
        streamEpoch,
        streamResetReason: message.speechResetReason,
        configId,
      }]
    : []
}

export function usePetSpeechPlayback({
  audioOutputDeviceId,
  isThinking,
  latestAssistantMessage,
  sessionId,
  ttsConfigId,
  ttsMode,
  speechVolume,
  speechRate,
}: PetSpeechPlaybackOptions) {
  const segments = useMemo(
    () => messageSpeechSegments(latestAssistantMessage, ttsConfigId),
    [latestAssistantMessage, ttsConfigId],
  )
  const speech = useTTSSpeech({
    audioOutputDeviceId,
    sessionId,
    mode: ttsMode,
    isThinking,
    segments,
    activeSegments: segments,
    messageRevisions: latestAssistantMessage
      ? [{
          messageId: latestAssistantMessage.id,
          epoch: latestAssistantMessage.speechEpoch ?? 0,
          reason: latestAssistantMessage.speechResetReason,
        }]
      : [],
    surface: "pet-bubble",
    speechVolume,
    speechRate,
  })

  return {
    activeSpeechSegmentId: speech.activeSegmentId,
    speechClips: speech.clips,
    speechOutputActive: speech.autoPlaybackPending,
    speechPaused: speech.paused,
    stopSpeechPlayback: speech.stop,
    toggleSpeechClip: (segmentId: string, messageId: string, rawText: string) =>
      speech.toggle(segmentId, rawText, messageId),
  }
}
