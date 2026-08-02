import { LoaderCircle, Mic, Pause, Play, X } from "lucide-react"

import type { RealtimeSTTStatus } from "../../../lib/realtime-stt"
import { VoiceLevelWaveform } from "./ChatInputControls"

interface VoiceConversationPanelProps {
  assistantName: string
  elapsedLabel: string
  error: string
  halfDuplexOutputActive: boolean
  input: string
  level: number
  onCancel: () => void
  onPause: () => void
  onResume: () => void
  paused: boolean
  status: RealtimeSTTStatus
  waiting: boolean
}

export function VoiceConversationPanel({
  assistantName,
  elapsedLabel,
  error,
  halfDuplexOutputActive,
  input,
  level,
  onCancel,
  onPause,
  onResume,
  paused,
  status,
  waiting,
}: VoiceConversationPanelProps) {
  const waitingForAssistant = halfDuplexOutputActive || waiting
  return (
    <div
      className="absolute inset-0 grid h-full w-full grid-cols-[26%_1fr_23%] items-center"
      aria-live="polite"
      aria-label={paused ? "语音对话已暂停" : waitingForAssistant ? "正在等待助手回复" : status === "recording" ? `正在转写，已录音 ${elapsedLabel}` : "正在连接语音服务"}
    >
      <div className="flex h-[58%] items-center justify-center gap-[1.5vh] border-r border-border/75 px-[8%]">
        <span className="flex h-[6.2vh] w-[6.2vh] flex-shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_0_0.9vh_rgba(217,119,6,0.10)] transition-transform" style={{ transform: `scale(${1 + level * 0.1})` }}>
          {paused ? <Pause className="h-[3vh] w-[3vh]" /> : status === "recording" ? <Mic className="h-[3vh] w-[3vh]" /> : <LoaderCircle className="h-[3vh] w-[3vh] animate-spin" />}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-[0.8vh] whitespace-nowrap text-[1.9vh] text-text-muted">
            <span className="h-[0.8vh] w-[0.8vh] rounded-full bg-accent" />
            {paused ? "已暂停" : waitingForAssistant ? "等待回复" : status === "recording" ? "正在聆听" : "正在连接"}
          </span>
          <span className="mt-[0.4vh] block text-[1.8vh] tabular-nums text-text-muted/80">{elapsedLabel}</span>
        </span>
      </div>

      <div className="flex h-[66%] min-w-0 flex-col justify-center px-[5%]">
        <div className="line-clamp-2 min-h-[5.8vh] text-[2.25vh] leading-[1.55] text-text">
          {input || (paused ? "语音对话已暂停，点击继续后恢复聆听" : waitingForAssistant ? `已发送，正在等待${assistantName}回复…` : status === "connecting" ? "正在连接语音服务…" : "请开始说话，识别结果会实时显示在这里")}
        </div>
        <div className="mt-[1.2vh] flex h-[2.6vh] w-full items-center overflow-hidden">
          <VoiceLevelWaveform level={level} active={!paused && status === "recording"} />
        </div>
        {error ? <div className="mt-[0.6vh] truncate text-[1.45vh] text-red-500">{error}</div> : null}
      </div>

      <div className="flex h-[58%] items-center justify-evenly border-l border-border/75 px-[5%]">
        <button
          type="button"
          onClick={() => void (paused ? onResume() : onPause())}
          className="group flex min-w-[42%] flex-col items-center gap-[0.7vh] text-accent transition-colors hover:opacity-80 disabled:cursor-wait disabled:opacity-50"
          disabled={!paused && status === "transcribing"}
          aria-label={paused ? "继续语音对话" : "暂停语音对话"}
          title={paused ? "继续语音对话" : "暂停语音对话"}
        >
          <span className="flex h-[5.3vh] w-[5.3vh] items-center justify-center rounded-full bg-accent text-white">
            {paused ? <Play className="h-[2.7vh] w-[2.7vh] fill-current" /> : <Pause className="h-[2.7vh] w-[2.7vh] fill-current" />}
          </span>
          <span className="text-[1.55vh]">{paused ? "继续" : "暂停"}</span>
        </button>
        <button
          type="button"
          onClick={() => void onCancel()}
          className="group flex min-w-[42%] flex-col items-center gap-[0.7vh] text-text-muted transition-colors hover:text-text disabled:cursor-wait disabled:opacity-50"
          disabled={status === "transcribing"}
          aria-label="结束语音对话"
          title="结束语音对话"
        >
          <span className="flex h-[5.3vh] w-[5.3vh] items-center justify-center rounded-full bg-bg transition-colors group-hover:bg-stone-200">
            <X className="h-[2.7vh] w-[2.7vh]" />
          </span>
          <span className="text-[1.55vh]">结束语音</span>
        </button>
      </div>
    </div>
  )
}
