import { useEffect, useState } from "react"
import { LoaderCircle, Pause, Play } from "lucide-react"

import { useTypewriterText } from "../../../hooks/useTypewriterText"
import type { SpeechClip, SpeechProgress } from "../../../hooks/useTTSSpeech"
import type { PetTTSMode } from "../../../lib/desktop-window"
import { textForTTS } from "../../../lib/tts-text"
import { cn } from "../../../lib/utils"
import type { MessageSegment } from "../../../types"
import { MarkdownContent } from "./MarkdownContent"

interface TextSegmentProps {
  segment: Extract<MessageSegment, { type: "text" }>
  isUser: boolean
  messageId: string
  isMessageStreaming?: boolean
  onTextReveal?: () => void
  ttsMode: PetTTSMode
  speechClips: Record<string, SpeechClip>
  activeSpeechSegmentId?: string | null
  speechPaused: boolean
  getSpeechProgress?: (segmentId: string) => SpeechProgress | null
  onToggleSpeech?: (segmentId: string, text: string, messageId: string) => void
  onSeekSpeech?: (segmentId: string, time: number) => void
  onBeginSeekSpeech?: (segmentId: string) => void
  onEndSeekSpeech?: (segmentId: string) => void
}

export function TextSegment({
  segment,
  isUser,
  messageId,
  isMessageStreaming,
  onTextReveal,
  ttsMode,
  speechClips,
  activeSpeechSegmentId,
  speechPaused,
  getSpeechProgress,
  onToggleSpeech,
  onSeekSpeech,
  onBeginSeekSpeech,
  onEndSeekSpeech,
}: TextSegmentProps) {
  const visibleContent = useTypewriterText({
    active: !isUser && Boolean(isMessageStreaming) && segment.state === "streaming",
    cacheKey: `${messageId}:${segment.id}`,
    target: segment.content,
    onFrame: onTextReveal,
  })
  const speechSegmentId = segment.id
  const clip = speechClips[speechSegmentId]
  const segmentComplete = segment.state !== "streaming"
  const canSpeak = segmentComplete && Boolean(textForTTS(visibleContent, ttsMode))
  const playing = activeSpeechSegmentId === speechSegmentId && !speechPaused
  const [activeProgress, setActiveProgress] = useState<SpeechProgress | null>(null)

  useEffect(() => {
    if (activeSpeechSegmentId !== speechSegmentId || !getSpeechProgress) {
      setActiveProgress(null)
      return
    }
    const update = () => setActiveProgress(getSpeechProgress(speechSegmentId))
    update()
    const timer = window.setInterval(update, 150)
    return () => window.clearInterval(timer)
  }, [activeSpeechSegmentId, getSpeechProgress, speechSegmentId])

  return (
    <div
      className={cn(
        "relative text-[1.82vh] leading-[1.58]",
        isUser
          ? "rounded-[2vh] rounded-tr-[0.45vh] border border-border bg-card px-[2.05vh] py-[1.35vh] font-sans text-text"
          : "w-full max-w-none bg-transparent px-[2.05vh] py-[0.35vh] text-text prose",
      )}
    >
      {isUser ? (
        <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{visibleContent}</div>
      ) : (
        <div className="min-w-0">
          <div className="flex min-w-0 items-end gap-[0.8vh]">
            <div className="markdown-body min-w-0 max-w-full flex-1 [overflow-wrap:anywhere]">
              <MarkdownContent
                content={visibleContent}
                paragraphClassName="my-0"
                separateActionLines
                actionParagraphClassName="my-0 italic text-text/60"
              />
            </div>
            {canSpeak && clip?.status === "synthesizing" ? (
              <LoaderCircle
                className="mb-[0.35vh] h-[1.8vh] w-[1.8vh] shrink-0 animate-spin text-text-muted"
                aria-label="正在合成语音"
              />
            ) : null}
            {canSpeak && clip?.status !== "synthesizing" ? (
              <button
                type="button"
                onClick={() => onToggleSpeech?.(speechSegmentId, visibleContent, messageId)}
                className={cn(
                  "mb-[0.15vh] flex h-[2.5vh] w-[2.5vh] shrink-0 items-center justify-center rounded-full transition-colors",
                  playing
                    ? "bg-accent/10 text-accent"
                    : clip?.status === "error"
                      ? "text-red-500"
                      : "text-text-muted hover:bg-bg hover:text-accent",
                )}
                aria-label={playing ? "暂停这段语音" : "播放这段语音"}
                title={
                  clip?.status === "error"
                    ? `重新合成并播放${clip.error ? `：${clip.error}` : ""}`
                    : playing
                      ? "暂停"
                      : "播放"
                }
              >
                {playing ? (
                  <Pause className="h-[1.45vh] w-[1.45vh] fill-current" />
                ) : (
                  <Play className="h-[1.45vh] w-[1.45vh] fill-current" />
                )}
              </button>
            ) : null}
          </div>
          {activeProgress ? (
            <input
              type="range"
              min={0}
              max={Math.max(activeProgress.duration, 0.01)}
              step={0.01}
              value={Math.min(activeProgress.currentTime, Math.max(activeProgress.duration, 0.01))}
              onPointerDown={() => onBeginSeekSpeech?.(speechSegmentId)}
              onPointerUp={() => onEndSeekSpeech?.(speechSegmentId)}
              onPointerCancel={() => onEndSeekSpeech?.(speechSegmentId)}
              onLostPointerCapture={() => onEndSeekSpeech?.(speechSegmentId)}
              onChange={(event) => onSeekSpeech?.(speechSegmentId, Number(event.currentTarget.value))}
              className="mt-[0.65vh] h-[0.35vh] w-full cursor-pointer accent-accent"
              aria-label="语音播放进度"
              aria-valuetext={`${Math.round(activeProgress.currentTime)} 秒，共 ${Math.round(activeProgress.duration)} 秒`}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
