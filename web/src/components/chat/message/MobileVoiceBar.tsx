import { useEffect, useState } from "react"
import { Pause, Play, Square } from "lucide-react"
import { voiceDuration, type VoiceClip, type VoiceProgress, type useTranscriptAudio } from "./mobile-transcript-audio"

export type TranscriptAudio = ReturnType<typeof useTranscriptAudio>

function timestamp(seconds: number) {
  const value = Math.floor(seconds)
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`
}

export function MobileVoiceBar({messageId, clipKey, clips, audio}: {
  messageId: string; clipKey: string; clips: VoiceClip[]; audio: TranscriptAudio
}) {
  const status = audio.state?.key === clipKey ? audio.state.status : null
  const [progress, setProgress] = useState<VoiceProgress | null>(null)
  const [dragPosition, setDragPosition] = useState<number | null>(null)
  const getProgress = audio.getProgress
  useEffect(() => {
    if (!status || status === "error") {
      setProgress(null)
      setDragPosition(null)
      return
    }
    const update = () => setProgress(getProgress(clipKey))
    update()
    const timer = window.setInterval(update, 150)
    return () => window.clearInterval(timer)
  }, [clipKey, getProgress, status])

  const label = status === "playing" ? "暂停语音" : status === "loading" ? "取消加载语音"
    : status === "paused" ? "继续播放语音" : status === "error" ? "重试播放语音" : "播放语音"
  const Icon = status === "playing" ? Pause : status === "loading" ? Square : Play
  const duration = progress?.duration || voiceDuration(clips)
  const position = Math.min(dragPosition ?? progress?.position ?? 0, duration)
  return <div className="voice">
    <div className="voice-bar">
      <button type="button" className="reply-icon" aria-label={label} title={label}
        disabled={audio.suspended}
        onClick={() => audio.toggle(clipKey, messageId, clips)}><Icon aria-hidden="true" /></button>
      {duration > 0 && <input type="range" className="voice-position" aria-label="语音播放进度"
        aria-valuetext={`${timestamp(position)} / ${timestamp(duration)}`}
        min={0} max={duration} step={0.01} value={position}
        disabled={status !== "playing" && status !== "paused"}
        onPointerDown={() => setDragPosition(position)}
        onPointerCancel={() => setDragPosition(null)}
        onPointerUp={event => {
          if (dragPosition != null) audio.seek(clipKey, event.currentTarget.valueAsNumber)
          setDragPosition(null)
        }}
        onChange={event => {
          const next = event.currentTarget.valueAsNumber
          if (dragPosition == null) audio.seek(clipKey, next)
          else setDragPosition(next)
        }} />}
      <span className="voice-time">
        {status === "loading" ? "加载中…" : duration > 0
          ? `${status === "playing" || status === "paused" ? `${timestamp(position)} / ` : ""}${timestamp(duration)}` : "语音"}
      </span>
    </div>
    {status === "error" && <span className="voice-error" role="status">{audio.state?.detail || "语音暂时无法播放"}</span>}
  </div>
}
