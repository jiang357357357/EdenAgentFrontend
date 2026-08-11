import { ArrowUp, Circle, Square } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useId, useRef } from "react"

import { formatTokenCount } from "../../../lib/token-usage"
import { cn } from "../../../lib/utils"

export function SendButton({
  canSend,
  disabled,
  dialogMode,
  overlay,
  onSend,
}: {
  canSend: boolean
  disabled?: boolean
  dialogMode: boolean
  overlay: boolean
  onSend: () => void
}) {
  const enabled = canSend && !disabled && !dialogMode

  return (
    <motion.button
      type="button"
      initial={false}
      animate={{ scale: enabled ? 1 : 0.96, opacity: enabled ? 1 : 0.86 }}
      onClick={onSend}
      disabled={!enabled}
      className={cn(
        "flex h-[5.2vh] w-[5.2vh] flex-shrink-0 items-center justify-center rounded-full shadow-none transition-[background-color,color,opacity] disabled:cursor-not-allowed",
        overlay
          ? "bg-stone-300/70 text-stone-800 hover:bg-stone-200 disabled:bg-stone-300/50 disabled:text-stone-700/70"
          : enabled
            ? "bg-accent text-white hover:bg-[#c66d05]"
            : "bg-stone-200/75 text-text-muted/60",
      )}
      aria-label="发送"
      title="发送"
    >
      <ArrowUp className="h-[2.7vh] w-[2.7vh]" />
    </motion.button>
  )
}

export function StopButton({ overlay, onStop }: { overlay: boolean; onStop: () => void }) {
  return (
    <motion.button
      type="button"
      initial={{ scale: 0.96, opacity: 0.86 }}
      animate={{ scale: 1, opacity: 1 }}
      onClick={onStop}
      className={cn(
        "flex h-[5.2vh] w-[5.2vh] flex-shrink-0 items-center justify-center rounded-full transition-colors",
        overlay
          ? "bg-stone-200/80 text-stone-800 hover:bg-stone-100"
          : "bg-stone-200/85 text-stone-700 hover:bg-stone-300/85",
      )}
      aria-label="停止生成"
      title="停止生成"
    >
      <Square className="h-[1.85vh] w-[1.85vh] fill-current" />
    </motion.button>
  )
}

export function TokenMeter({
  inputTokens,
  contextTokens,
  contextWindow,
  breakdown,
}: {
  inputTokens: number
  contextTokens: number
  contextWindow: number
  breakdown?: import("../../../types").TokenBreakdown
}) {
  const contextPercent = Math.min(100, (contextTokens / Math.max(1, contextWindow)) * 100)
  const contextArcLength = Math.min(58, Math.max(0, contextPercent * 0.58))
  const warning = contextPercent >= 85
  const tooltipId = useId()

  return (
    <div className="group/token relative flex h-[4.7vh] w-[4.7vh] items-center justify-center">
      <button
        type="button"
        className={cn(
          "relative flex h-[4.7vh] w-[4.7vh] items-center justify-center rounded-full bg-card text-[1.65vh] font-medium tabular-nums outline-none transition-transform hover:scale-[1.04] focus-visible:scale-[1.04]",
          warning ? "text-red-600" : "text-text-muted",
        )}
        aria-label={`本次输入约 ${inputTokens} tokens，角色人设约 ${breakdown?.character ?? 0}，技能约 ${breakdown?.skills ?? 0}，系统约 ${breakdown?.system ?? 0}，工具约 ${breakdown?.tools ?? 0}，对话历史约 ${breakdown?.history ?? contextTokens - inputTokens}，命中缓冲 ${breakdown?.cacheRead ?? 0}，当前上下文 ${contextTokens}，可用上限 ${contextWindow}`}
        aria-describedby={tooltipId}
      >
        <Circle className="absolute inset-0 h-full w-full text-border" strokeWidth={1.7} aria-hidden="true" />
        <Circle
          className={cn(
            "absolute inset-[0.15vh] h-[calc(100%-0.3vh)] w-[calc(100%-0.3vh)] -rotate-90",
            warning ? "text-red-500" : "text-accent",
          )}
          strokeWidth={2.15}
          strokeDasharray={`${contextArcLength} 64`}
          strokeLinecap="round"
          aria-hidden="true"
        />
        <span className="relative z-10 max-w-[3.1vh] truncate">{formatTokenCount(inputTokens)}</span>
      </button>

      <div
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-[calc(100%+1.25vh)] right-0 z-50 w-[20.5vh] translate-y-[0.35vh] rounded-[1.05vh] border border-border bg-card/98 px-[1.6vh] py-[1.15vh] text-[1.45vh] text-text opacity-0 shadow-lg backdrop-blur-md transition-[opacity,transform,visibility] duration-150 group-hover/token:visible group-hover/token:translate-y-0 group-hover/token:opacity-100 group-focus-within/token:visible group-focus-within/token:translate-y-0 group-focus-within/token:opacity-100"
      >
        <span className="absolute bottom-[-0.45vh] right-[1.95vh] h-[0.8vh] w-[0.8vh] rotate-45 border-b border-r border-border bg-card" aria-hidden="true" />
        <span className="grid grid-cols-[1fr_auto] gap-x-[1.3vh] gap-y-[0.65vh]">
          <span className="text-text-muted">本次输入</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(inputTokens)}</strong>
          <span className="text-text-muted">角色人设</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(breakdown?.character ?? 0)}</strong>
          <span className="text-text-muted">技能</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(breakdown?.skills ?? 0)}</strong>
          <span className="text-text-muted">系统</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(breakdown?.system ?? 0)}</strong>
          <span className="text-text-muted">工具</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(breakdown?.tools ?? 0)}</strong>
          <span className="text-text-muted">对话历史</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(breakdown?.history ?? Math.max(0, contextTokens - inputTokens))}</strong>
          <span className="text-text-muted">命中缓冲</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(breakdown?.cacheRead ?? 0)}</strong>
          <span className="text-text-muted">当前上下文</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(contextTokens)}</strong>
          <span className="text-text-muted">可用上限</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(contextWindow)}</strong>
        </span>
      </div>
    </div>
  )
}

export function VoiceLevelWaveform({ level, active }: { level: number; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targetLevelRef = useRef(0)
  const activeRef = useRef(active)
  const startDrawingRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    activeRef.current = active
    targetLevelRef.current = active ? Math.max(0, Math.min(1, level)) : 0
    startDrawingRef.current?.()
  }, [active, level])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const history = Array.from<number>({ length: 72 }).fill(0)
    let currentLevel = 0
    let lastSampleAt = performance.now()
    let animationFrame = 0

    const shouldContinue = () => activeRef.current || targetLevelRef.current > 0.001 || currentLevel > 0.001 || history.some((sample) => sample > 0.001)

    const draw = (now: number) => {
      const ratio = window.devicePixelRatio || 1
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      currentLevel += (targetLevelRef.current - currentLevel) * (targetLevelRef.current > currentLevel ? 0.3 : 0.12)
      if (now - lastSampleAt >= 48) {
        history.shift()
        history.push(currentLevel < 0.025 ? 0 : Math.pow(currentLevel, 0.72))
        lastSampleAt = now
      }

      const context = canvas.getContext("2d")
      if (context) {
        context.clearRect(0, 0, width, height)
        const centerY = height / 2
        context.beginPath()
        context.moveTo(0, centerY)
        context.lineTo(width, centerY)
        context.strokeStyle = "rgba(217, 119, 6, 0.28)"
        context.lineWidth = Math.max(1, ratio * 0.8)
        context.stroke()

        const slot = width / history.length
        context.strokeStyle = "rgba(217, 119, 6, 0.92)"
        context.lineWidth = Math.max(1, slot * 0.32)
        context.lineCap = "round"
        history.forEach((sample, index) => {
          if (sample <= 0) return
          const x = slot * index + slot / 2
          const halfHeight = Math.max(ratio, sample * height * 0.43)
          context.beginPath()
          context.moveTo(x, centerY - halfHeight)
          context.lineTo(x, centerY + halfHeight)
          context.stroke()
        })
      }
      if (shouldContinue()) animationFrame = window.requestAnimationFrame(draw)
      else animationFrame = 0
    }

    const startDrawing = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(draw)
    }
    startDrawingRef.current = startDrawing
    startDrawing()
    return () => {
      startDrawingRef.current = null
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  return <canvas ref={canvasRef} className="h-[2.6vh] w-[54%]" aria-hidden="true" />
}
