import { useState, useRef, useEffect, useId } from "react"
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  Circle,
  FileText,
  History,
  Keyboard,
  LoaderCircle,
  Mic,
  MessageSquare,
  Move,
  Plus,
  ShieldAlert,
  Square,
  X,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import {
  getRuntimeModelConfig,
  resolveMonAgentUrl,
  updateRuntimeModel,
  type RuntimeModelConfig,
  type RuntimeModelOption,
} from "../lib/mon_agent_api"
import {
  availableSlashCommands,
  filterSlashCommands,
  findSlashCommand,
  parseSlashCommand,
  slashCommandQuery,
  type SlashCommandDefinition,
  type SlashCommandName,
} from "../lib/slash-commands"
import { cn } from "../lib/utils"
import { MarkdownContent } from "./MarkdownContent"
import { RealtimeSTTService, type RealtimeSTTStatus } from "../lib/realtime-stt"
import { updateDesktopActivityFacts } from "../lib/desktop-window"
import { DEFAULT_CONTEXT_WINDOW, estimateTextTokens, formatTokenCount } from "../lib/token-usage"
import type { PermissionMode, PromptAttachment, ToolCall } from "../types"

type DialogSegment = {
  speaker: string
  text?: string
  images?: string[]
  runtimeTrace?: string
  thinking?: string
  tool?: ToolCall
}

interface ChatInputProps {
  onSend: (text: string, attachments: PromptAttachment[]) => void
  disabled?: boolean
  overlay?: boolean
  onHistory?: () => void
  onStartWindowDrag?: () => void
  outputActive?: boolean
  outputContent?: string
  outputThinking?: string
  outputTools?: ToolCall[]
  dialogSegments?: DialogSegment[]
  assistantName?: string
  onPreviewImage?: (src: string, alt?: string) => void
  overlayCompact?: boolean
  hideOverlayActions?: boolean
  hideComposerFooter?: boolean
  overlayOpacity?: number
  overlayHeight?: number
  overlayFontScale?: number
  standaloneOverlay?: boolean
  permissionMode?: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => Promise<void>
  voiceInputEnabled?: boolean
  sttConfigId?: number | null
  contextTokenEstimate?: number
  onCompact?: (instructions?: string) => void | Promise<void>
  onAbort?: () => void | Promise<void>
  onNewSession?: () => void | Promise<void>
  onOpenSettings?: () => void
  onOpenMemo?: () => void
  onOpenSelfAwake?: () => void
  onOpenSkills?: () => void
}

const permissionOptions: Array<{ mode: PermissionMode; label: string; description: string }> = [
  { mode: "full_access", label: "完全访问", description: "自动允许工具权限" },
  { mode: "ask", label: "询问授权", description: "写入、命令等操作前确认" },
]

function SendButton({
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

function StopButton({ overlay, onStop }: { overlay: boolean; onStop: () => void }) {
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

function TokenMeter({
  inputTokens,
  contextTokens,
  contextWindow,
}: {
  inputTokens: number
  contextTokens: number
  contextWindow: number
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
        aria-label={`本次输入约 ${inputTokens} tokens，会话上下文约 ${contextTokens}，可用上限 ${contextWindow}`}
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
          <span className="text-text-muted">会话上下文</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(contextTokens)}</strong>
          <span className="text-text-muted">可用上限</span>
          <strong className="font-medium tabular-nums">{formatTokenCount(contextWindow)}</strong>
        </span>
      </div>
    </div>
  )
}

function VoiceLevelWaveform({ level, active }: { level: number; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targetLevelRef = useRef(0)

  useEffect(() => {
    targetLevelRef.current = active ? Math.max(0, Math.min(1, level)) : 0
  }, [active, level])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const history = Array.from<number>({ length: 72 }).fill(0)
    let currentLevel = 0
    let lastSampleAt = performance.now()
    let animationFrame = 0

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
      animationFrame = window.requestAnimationFrame(draw)
    }

    animationFrame = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [])

  return <canvas ref={canvasRef} className="h-[2.6vh] w-[54%]" aria-hidden="true" />
}

export function ChatInput({
  onSend,
  disabled,
  overlay = false,
  onHistory,
  onStartWindowDrag,
  outputActive = false,
  outputContent = "",
  outputThinking,
  outputTools = [],
  dialogSegments,
  assistantName = "助手",
  onPreviewImage,
  overlayCompact = false,
  hideOverlayActions = false,
  hideComposerFooter = false,
  overlayOpacity = 76,
  overlayHeight,
  overlayFontScale = 100,
  standaloneOverlay = false,
  permissionMode = "full_access",
  onPermissionModeChange,
  voiceInputEnabled = false,
  sttConfigId,
  contextTokenEstimate = 0,
  onCompact,
  onAbort,
  onNewSession,
  onOpenSettings,
  onOpenMemo,
  onOpenSelfAwake,
  onOpenSkills,
}: ChatInputProps) {
  const [input, setInput] = useState("")
  const [attachments, setAttachments] = useState<PromptAttachment[]>([])
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false)
  const [permissionSubmitting, setPermissionSubmitting] = useState<PermissionMode | null>(null)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelConfig, setModelConfig] = useState<RuntimeModelConfig | null>(null)
  const [modelLoading, setModelLoading] = useState(false)
  const [modelSubmitting, setModelSubmitting] = useState<string | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<RealtimeSTTStatus>("idle")
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [voiceError, setVoiceError] = useState("")
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0)
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const [slashPointerActive, setSlashPointerActive] = useState(false)
  const [slashCursor, setSlashCursor] = useState(0)
  const [slashMenuDismissedFor, setSlashMenuDismissedFor] = useState<string | null>(null)
  const [slashCommandError, setSlashCommandError] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const slashOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const dragTimerRef = useRef<number | undefined>(undefined)
  const previousSegmentCountRef = useRef(0)
  const voicePrefixRef = useRef("")
  const voiceOriginalInputRef = useRef("")
  const voiceStartedAtRef = useRef<number | null>(null)
  const voiceServiceRef = useRef<RealtimeSTTService | null>(null)
  const outputToolsKey = outputTools.map((tool) => `${tool.id}:${tool.status}:${tool.duration ?? ""}`).join("|")
  const fallbackOutputSegments: DialogSegment[] = [
    ...(outputThinking ? [{ speaker: assistantName, thinking: outputThinking }] : []),
    ...outputTools.map((tool) => ({
      speaker: assistantName,
      tool,
    })),
    ...outputContent
      .split(/\n{2,}/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ speaker: assistantName, text })),
  ]
  const outputSegments = dialogSegments?.length ? dialogSegments : fallbackOutputSegments
  const [outputIndex, setOutputIndex] = useState(0)
  const [overlayMode, setOverlayMode] = useState<"input" | "dialog">("input")
  const hasDialog = overlay && (outputActive || outputSegments.length > 0)
  const isDialogMode = overlay && overlayMode === "dialog" && hasDialog
  const currentOutput = outputSegments[Math.min(outputIndex, Math.max(outputSegments.length - 1, 0))]
  const overlayFontRatio = Math.max(70, Math.min(140, overlayFontScale)) / 100
  const voiceBusy = voiceStatus !== "idle"
  const canSend = Boolean(input.trim() || attachments.length > 0) && !voiceBusy
  const activePermission = permissionOptions.find((option) => option.mode === permissionMode) ?? permissionOptions[0]
  const currentModel = modelConfig?.current ?? modelConfig?.options.find((option) => option.selected) ?? null
  const inputTokens = estimateTextTokens(input)
  const contextWindow = currentModel?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
  const contextTokens = Math.min(contextWindow, contextTokenEstimate + inputTokens)
  const currentModelLabel = currentModel?.label || (modelLoading ? "..." : "模型")
  const modelButtonTitle = modelError
    ? `模型配置读取失败: ${modelError}`
    : currentModel
      ? `模型: ${currentModel.label} (${currentModel.providerName || currentModel.provider}/${currentModel.modelID})`
      : "模型"
  const slashCommands = availableSlashCommands({
    compact: Boolean(onCompact),
    newSession: Boolean(onNewSession),
    settings: Boolean(onOpenSettings),
    memo: Boolean(onOpenMemo),
    selfAwake: Boolean(onOpenSelfAwake),
    skills: Boolean(onOpenSkills),
  })
  const slashQuery = slashCommandQuery(input, slashCursor)
  const filteredSlashCommands = slashQuery === null ? [] : filterSlashCommands(slashCommands, slashQuery)
  const slashMenuOpen =
    !voiceBusy &&
    !isDialogMode &&
    slashQuery !== null &&
    filteredSlashCommands.length > 0 &&
    slashMenuDismissedFor !== input

  useEffect(() => {
    setSlashSelectedIndex(0)
    setSlashPointerActive(false)
  }, [slashQuery])

  useEffect(() => {
    if (!slashMenuOpen) return
    const menu = slashMenuRef.current
    const option = slashOptionRefs.current[slashSelectedIndex]
    if (!menu || !option) return

    const frame = window.requestAnimationFrame(() => {
      const optionTop = option.offsetTop
      const optionBottom = optionTop + option.offsetHeight
      const visibleTop = menu.scrollTop
      const visibleBottom = visibleTop + menu.clientHeight
      const edgePadding = 8

      if (optionTop < visibleTop + edgePadding) {
        menu.scrollTo({ top: Math.max(0, optionTop - edgePadding) })
      } else if (optionBottom > visibleBottom - edgePadding) {
        menu.scrollTo({ top: optionBottom - menu.clientHeight + edgePadding })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [slashMenuOpen, slashSelectedIndex])

  const refreshModelConfig = async () => {
    setModelLoading(true)
    setModelError(null)
    try {
      setModelConfig(await getRuntimeModelConfig())
    } catch (error) {
      setModelError(error instanceof Error ? error.message : String(error))
    } finally {
      setModelLoading(false)
    }
  }

  useEffect(() => {
    if (hideComposerFooter) return
    let active = true
    setModelLoading(true)
    setModelError(null)
    getRuntimeModelConfig()
      .then((config) => {
        if (active) setModelConfig(config)
      })
      .catch((error) => {
        if (active) setModelError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (active) setModelLoading(false)
      })
    return () => {
      active = false
    }
  }, [hideComposerFooter])

  useEffect(() => {
    const previousCount = previousSegmentCountRef.current
    const nextCount = outputSegments.length
    previousSegmentCountRef.current = nextCount

    setOutputIndex(Math.max(outputSegments.length - 1, 0))
    if (overlay && (outputActive || nextCount > previousCount)) setOverlayMode("dialog")
  }, [assistantName, outputActive, outputContent, outputThinking, outputToolsKey, outputSegments.length])

  useEffect(() => {
    if (textareaRef.current) {
      if (overlay) {
        textareaRef.current.style.height = ""
        return
      }
      textareaRef.current.style.height = "auto"
      const maxHeight = window.innerHeight * 0.24
      const contentHeight = textareaRef.current.scrollHeight
      textareaRef.current.style.height = `${Math.min(contentHeight, maxHeight)}px`
      textareaRef.current.style.overflowY = contentHeight > maxHeight + 1 ? "auto" : "hidden"
    }
  }, [input, overlay])

  useEffect(() => () => {
    void voiceServiceRef.current?.cancel()
    voiceServiceRef.current = null
    void updateDesktopActivityFacts({
      surface: overlay ? "chat-overlay" : "main-chat",
      chat_input_focused: false,
      voice_recording: false,
    })
  }, [])

  useEffect(() => {
    void updateDesktopActivityFacts({
      surface: overlay ? "chat-overlay" : "main-chat",
      voice_recording: voiceStatus === "recording",
      ...(voiceStatus === "recording" ? { last_user_interaction_at: new Date().toISOString() } : {}),
    })
  }, [overlay, voiceStatus])

  useEffect(() => {
    if (voiceInputEnabled) return
    void voiceServiceRef.current?.cancel()
    voiceServiceRef.current = null
    setVoiceError("")
  }, [voiceInputEnabled])

  useEffect(() => {
    if (voiceStatus !== "recording" || voiceStartedAtRef.current === null) return
    const updateElapsed = () => {
      const startedAt = voiceStartedAtRef.current
      if (startedAt === null) return
      setVoiceElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)))
    }
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 250)
    return () => window.clearInterval(timer)
  }, [voiceStatus])

  const openPermissionMenu = () => {
    setPermissionMenuOpen(true)
    setModelMenuOpen(false)
  }

  const openModelMenu = () => {
    setModelMenuOpen(true)
    setPermissionMenuOpen(false)
    if (!modelConfig && !modelLoading) void refreshModelConfig()
  }

  const executeSlashCommand = (command: SlashCommandDefinition, args = "") => {
    if (disabled) {
      setSlashCommandError("智能体正在处理当前任务，请稍后再执行命令。")
      setSlashMenuDismissedFor(input)
      return
    }
    if (attachments.length > 0) {
      setSlashCommandError("命令不能和附件一起提交。")
      setSlashMenuDismissedFor(input)
      return
    }

    setInput("")
    setSlashCursor(0)
    setAttachments([])
    setSlashCommandError("")
    setSlashMenuDismissedFor(null)

    const actions: Record<SlashCommandName, () => void | Promise<void>> = {
      help: () => {
        setInput("/")
        setSlashCursor(1)
        window.requestAnimationFrame(() => {
          textareaRef.current?.focus()
          textareaRef.current?.setSelectionRange(1, 1)
        })
      },
      compact: () => onCompact?.(args),
      new: () => void onNewSession?.(),
      model: openModelMenu,
      permissions: openPermissionMenu,
      settings: () => onOpenSettings?.(),
      memo: () => onOpenMemo?.(),
      "self-awake": () => onOpenSelfAwake?.(),
      skills: () => onOpenSkills?.(),
    }
    Promise.resolve(actions[command.name]()).catch((error) => {
      setSlashCommandError(error instanceof Error ? error.message : String(error))
    })
  }

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || disabled || voiceBusy) return

    const parsedCommand = parseSlashCommand(input)
    if (parsedCommand) {
      if (!parsedCommand.name) return
      if (parsedCommand.name.startsWith("skill:")) {
        onSend(input.trim(), attachments)
        void updateDesktopActivityFacts({
          surface: overlay ? "chat-overlay" : "main-chat",
          last_user_interaction_at: new Date().toISOString(),
        })
        setInput("")
        setSlashCursor(0)
        setAttachments([])
        setSlashCommandError("")
        return
      }
      const command = findSlashCommand(slashCommands, parsedCommand.name)
      if (!command) {
        setSlashCommandError(`未知命令 “/${parsedCommand.name}”。输入 / 查看可用命令。`)
        return
      }
      if (parsedCommand.args && !command.acceptsArguments) {
        setSlashCommandError(`/${command.name} 暂不接受参数。`)
        return
      }
      executeSlashCommand(command, parsedCommand.args)
      return
    }

    onSend(input.trim(), attachments)
    void updateDesktopActivityFacts({
      surface: overlay ? "chat-overlay" : "main-chat",
      last_user_interaction_at: new Date().toISOString(),
    })
    setInput("")
    setSlashCursor(0)
    setAttachments([])
    setSlashCommandError("")
  }

  const finishVoiceInput = async () => {
    const service = voiceServiceRef.current
    if (!service) return
    try {
      await service.finish()
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "语音转写失败")
    } finally {
      voiceStartedAtRef.current = null
      if (voiceServiceRef.current === service) voiceServiceRef.current = null
    }
  }

  const cancelVoiceInput = async () => {
    const service = voiceServiceRef.current
    voiceServiceRef.current = null
    voiceStartedAtRef.current = null
    setVoiceElapsedSeconds(0)
    setInput(voiceOriginalInputRef.current)
    setVoiceError("")
    await service?.cancel()
  }

  const toggleVoiceInput = async () => {
    if (!voiceInputEnabled || disabled || voiceStatus === "connecting" || voiceStatus === "transcribing") return
    if (voiceStatus === "recording") {
      await finishVoiceInput()
      return
    }
    if (typeof sttConfigId !== "number") {
      setVoiceError("当前角色尚未关联语音识别服务")
      return
    }
    setVoiceError("")
    setPermissionMenuOpen(false)
    setModelMenuOpen(false)
    voiceOriginalInputRef.current = input
    voicePrefixRef.current = input.trim() ? `${input.trim()} ` : ""
    voiceStartedAtRef.current = Date.now()
    setVoiceElapsedSeconds(0)
    const service = new RealtimeSTTService({
      onStatus: setVoiceStatus,
      onLevel: setVoiceLevel,
      onTranscript: ({ text }) => setInput(`${voicePrefixRef.current}${text}`),
      onError: (error) => setVoiceError(error.message),
    })
    voiceServiceRef.current = service
    try {
      await service.start({ configId: sttConfigId, endSilenceMs: 1_200 })
    } catch {
      voiceStartedAtRef.current = null
      if (voiceServiceRef.current === service) voiceServiceRef.current = null
    }
  }

  const voiceElapsedLabel = `${String(Math.floor(voiceElapsedSeconds / 60)).padStart(2, "0")}:${String(voiceElapsedSeconds % 60).padStart(2, "0")}`

  const selectPermissionMode = async (mode: PermissionMode) => {
    if (!onPermissionModeChange || mode === permissionMode) {
      setPermissionMenuOpen(false)
      return
    }
    setPermissionSubmitting(mode)
    try {
      await onPermissionModeChange(mode)
      setPermissionMenuOpen(false)
    } finally {
      setPermissionSubmitting(null)
    }
  }

  const togglePermissionMenu = () => {
    setPermissionMenuOpen((open) => !open)
    setModelMenuOpen(false)
  }

  const toggleModelMenu = () => {
    setModelMenuOpen((open) => !open)
    setPermissionMenuOpen(false)
    if (!modelConfig && !modelLoading) void refreshModelConfig()
  }

  const selectModel = async (option: RuntimeModelOption) => {
    if (option.selected || modelSubmitting) {
      setModelMenuOpen(false)
      return
    }
    setModelSubmitting(option.id)
    setModelError(null)
    try {
      setModelConfig(await updateRuntimeModel(option.aiEntityId))
      setModelMenuOpen(false)
    } catch (error) {
      setModelError(error instanceof Error ? error.message : String(error))
    } finally {
      setModelSubmitting(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashMenuOpen) {
      if (e.key === "ArrowUp" || (e.ctrlKey && e.key.toLowerCase() === "p")) {
        e.preventDefault()
        setSlashPointerActive(false)
        setSlashSelectedIndex((index) => (index - 1 + filteredSlashCommands.length) % filteredSlashCommands.length)
        return
      }
      if (e.key === "ArrowDown" || (e.ctrlKey && e.key.toLowerCase() === "n")) {
        e.preventDefault()
        setSlashPointerActive(false)
        setSlashSelectedIndex((index) => (index + 1) % filteredSlashCommands.length)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setSlashMenuDismissedFor(input)
        return
      }
      if (e.key === "Tab") {
        e.preventDefault()
        setSlashPointerActive(false)
        const command = filteredSlashCommands[slashSelectedIndex]
        if (command) {
          setInput(`/${command.name} `)
          setSlashCursor(command.name.length + 2)
          setSlashCommandError("")
          window.requestAnimationFrame(() => {
            const textarea = textareaRef.current
            if (!textarea) return
            textarea.focus()
            textarea.setSelectionRange(textarea.value.length, textarea.value.length)
          })
        }
        return
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        setSlashPointerActive(false)
        const command = filteredSlashCommands[slashSelectedIndex]
        if (command) executeSlashCommand(command)
        return
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const addFileAttachment = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      if (event.target?.result && typeof event.target.result === "string") {
        setAttachments((prev) => [
          ...prev,
          {
            url: event.target!.result as string,
            filename: file.name || `attachment-${prev.length + 1}`,
            mime: file.type || "application/octet-stream",
            size: file.size,
          },
        ])
      }
    }
    reader.readAsDataURL(file)
  }

  const addFileAttachments = (files: FileList | File[]) => {
    for (const file of Array.from(files)) addFileAttachment(file)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      const file = item.getAsFile()
      if (file) addFileAttachment(file)
    }
  }

  const handleFilePick = () => {
    fileInputRef.current?.click()
  }

  const clearDragTimer = () => {
    if (dragTimerRef.current !== undefined) {
      window.clearTimeout(dragTimerRef.current)
      dragTimerRef.current = undefined
    }
  }

  const handleDragPointerDown = () => {
    if (!onStartWindowDrag) return
    clearDragTimer()
    dragTimerRef.current = window.setTimeout(() => {
      dragTimerRef.current = undefined
      onStartWindowDrag()
    }, 220)
  }

  const advanceOutput = () => {
    if (!isDialogMode) return
    setOutputIndex((index) => {
      if (index >= outputSegments.length - 1) {
        setOverlayMode("input")
        return index
      }
      return index + 1
    })
  }

  const previousOutput = () => {
    if (!isDialogMode) return
    setOutputIndex((index) => Math.max(index - 1, 0))
  }

  const toggleOverlayMode = () => {
    if (!hasDialog) return
    setOverlayMode((mode) => (mode === "dialog" ? "input" : "dialog"))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    addFileAttachments(files)
    e.target.value = ""
  }

  const hasDraggedFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files")

  const handleDragOver = (event: React.DragEvent) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    setDraggingFiles(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDraggingFiles(false)
    }
  }

  const handleDrop = (event: React.DragEvent) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    setDraggingFiles(false)
    addFileAttachments(event.dataTransfer.files)
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 [container-type:size]",
        overlay
          ? "bg-transparent p-0"
          : "bg-gradient-to-t from-bg via-bg/95 to-transparent pt-[1.2vh] pb-[2.8vh]",
      )}
      style={overlay ? { height: standaloneOverlay ? "100%" : `${overlayHeight ?? (overlayCompact ? 20 : 40)}vh` } : undefined}
    >
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex gap-2 mb-2 px-2 overflow-x-auto"
          >
            {attachments.map((attachment, idx) => (
              <div key={`${attachment.filename ?? "attachment"}-${idx}`} className="relative group flex-shrink-0">
                {attachment.mime.startsWith("image/") ? (
                  <img src={attachment.url} alt={attachment.filename ?? "附件预览"} className="h-[10vh] w-[10vh] rounded-[1.4vh] border border-border object-cover" />
                ) : (
                  <div className="flex h-[10vh] w-[24vw] items-center gap-[1vw] rounded-[1.4vh] border border-border bg-card px-[1.8vw] text-[1.8vh] text-text">
                    <FileText className="h-[2.6vh] w-[2.6vh] flex-shrink-0 text-text-muted" />
                    <span className="truncate">{attachment.filename ?? "附件"}</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(idx)}
                  className="absolute right-[-0.9vh] top-[-0.9vh] rounded-full border border-border bg-card p-[0.35vh] text-accent opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-[2vh] w-[2vh]" />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn("relative", overlay && "h-full")}>
        <AnimatePresence>
          {slashMenuOpen && (
            <motion.div
              key="slash-command-menu"
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.99 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              role="listbox"
              aria-label="斜杠命令"
              ref={slashMenuRef}
              onWheel={() => setSlashPointerActive(false)}
              className={cn(
                "absolute inset-x-[2.2vh] bottom-[calc(100%+0.8vh)] z-40 max-h-[42vh] overflow-y-auto rounded-[1.8vh] border p-[0.7vh] shadow-xl backdrop-blur-xl",
                overlay
                  ? "border-white/12 bg-stone-950/92 text-stone-100"
                  : "border-border bg-card/98 text-text",
              )}
            >
              <div className={cn("px-[1.2vh] py-[0.8vh] text-[1.35vh]", overlay ? "text-stone-400" : "text-text-muted")}>命令</div>
              {filteredSlashCommands.map((command, index) => {
                const selected = index === slashSelectedIndex
                return (
                  <button
                    key={command.name}
                    ref={(element) => {
                      slashOptionRefs.current[index] = element
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onPointerMove={() => {
                      setSlashPointerActive(true)
                      setSlashSelectedIndex(index)
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => executeSlashCommand(command)}
                    className={cn(
                      "flex w-full items-center gap-[1.4vh] rounded-[1.25vh] px-[1.2vh] py-[1.05vh] text-left transition-colors",
                      selected
                        ? overlay
                          ? "bg-white/10 text-white"
                          : "bg-[#fff7e8] text-text"
                        : overlay
                          ? cn("text-stone-300", slashPointerActive && "hover:bg-white/8")
                          : cn("text-text-muted", slashPointerActive && "hover:bg-bg"),
                    )}
                  >
                    <span className={cn(
                      "flex h-[3.3vh] w-[3.3vh] flex-shrink-0 items-center justify-center rounded-[0.9vh] font-mono text-[1.8vh] font-semibold",
                      selected ? "bg-accent/12 text-accent" : overlay ? "bg-white/6 text-stone-400" : "bg-bg text-text-muted",
                    )}>/</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[1.65vh] font-medium text-current">/{command.name}</span>
                      <span className={cn("mt-[0.2vh] block truncate text-[1.35vh]", selected ? "opacity-70" : "opacity-80")}>{command.description}</span>
                    </span>
                    {selected && <span className="text-[1.2vh] opacity-55">Enter</span>}
                  </button>
                )
              })}
              <div className={cn(
                "mt-[0.45vh] border-t px-[1.2vh] py-[0.8vh] text-[1.15vh]",
                overlay ? "border-white/8 text-stone-500" : "border-border/70 text-text-lighter",
              )}>
                ↑↓ 选择 · Tab 补全 · Enter 执行 · Esc 关闭
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          style={overlay ? { backgroundColor: `rgba(28, 25, 23, ${Math.max(30, Math.min(100, overlayOpacity)) / 100})` } : undefined}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "transition-colors",
            overlay
              ? cn(
                  "relative h-full overflow-hidden border bg-stone-950/30 shadow-none backdrop-blur-md focus-within:border-white/25",
                  standaloneOverlay ? "rounded-[10cqh]" : "rounded-[3.3vh]",
                  draggingFiles ? "border-orange-300/70 ring-2 ring-orange-300/30" : "border-white/12",
                )
              : cn(
                  "relative min-h-[16vh] overflow-visible rounded-[3.3vh] border bg-card/96 shadow-sm backdrop-blur-md focus-within:border-border",
                  draggingFiles ? "border-orange-300/70 ring-2 ring-orange-300/25" : "border-border",
                ),
          )}
        >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {isDialogMode ? (
          <div
            onClick={advanceOutput}
            className={cn(
              "absolute inset-0 box-border h-full w-full cursor-pointer overflow-y-auto overflow-x-hidden text-left leading-relaxed text-stone-100 [overflow-wrap:anywhere] [&::-webkit-scrollbar]:hidden",
              standaloneOverlay ? "px-[8cqh] pb-[8cqh] pt-[8cqh]" : "px-[2.8vh] pb-[8.2vh] pt-[2.7vh]",
            )}
            style={{ fontSize: standaloneOverlay ? `${10.5 * overlayFontRatio}cqh` : `${1.72 * overlayFontRatio}vh` }}
          >
            {currentOutput ? (
              <div>
                {currentOutput.runtimeTrace && (
                  <details
                    className="mb-3 rounded-lg border border-teal-200/15 bg-teal-300/10 px-3 py-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <summary className="cursor-pointer select-none text-[0.8em] tracking-[0.14em] text-teal-100/85">
                      运行过程
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap text-[0.95em] text-stone-200 [overflow-wrap:anywhere]">
                      {currentOutput.runtimeTrace}
                    </div>
                  </details>
                )}
                {currentOutput.thinking && (
                  <details
                    className="mb-3 rounded-lg border border-sky-200/15 bg-sky-300/10 px-3 py-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <summary className="cursor-pointer select-none text-[0.8em] tracking-[0.14em] text-sky-100/85">
                      思考
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap text-[0.95em] text-stone-200 [overflow-wrap:anywhere]">
                      {currentOutput.thinking}
                    </div>
                  </details>
                )}
                {currentOutput.tool && (
                  <details
                    className="mb-3 rounded-lg border border-emerald-200/15 bg-emerald-300/10 px-3 py-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <summary className="cursor-pointer select-none text-[0.8em] tracking-[0.14em] text-emerald-100/85">
                      工具: {currentOutput.tool.name}
                    </summary>
                    <div className="mt-2 grid gap-2 text-[0.88em] text-stone-200">
                      <div>
                        状态: {currentOutput.tool.status}
                        {currentOutput.tool.duration ? ` · ${currentOutput.tool.duration}ms` : ""}
                      </div>
                      <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-2 [overflow-wrap:anywhere]">
                        {currentOutput.tool.input}
                      </pre>
                      {currentOutput.tool.output && (
                        <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-2 [overflow-wrap:anywhere]">
                          {currentOutput.tool.output}
                        </pre>
                      )}
                      {currentOutput.tool.error && (
                        <pre className="whitespace-pre-wrap rounded-lg border border-red-300/20 bg-red-950/30 p-2 text-red-100 [overflow-wrap:anywhere]">
                          {currentOutput.tool.error}
                        </pre>
                      )}
                    </div>
                  </details>
                )}
                {currentOutput.text && (
                  <MarkdownContent
                    content={currentOutput.text}
                    separateActionLines
                    imageClassName="my-2 max-h-32 max-w-full rounded-lg border border-white/10 object-contain"
                    paragraphClassName="mb-3 last:mb-0"
                  />
                )}
                {currentOutput.images && currentOutput.images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {currentOutput.images.map((image, index) => {
                      const src = resolveMonAgentUrl(image)
                      return (
                        <img
                          key={`${image}-${index}`}
                          src={src}
                          alt="会话图片"
                          onClick={(event) => {
                            event.stopPropagation()
                            onPreviewImage?.(src, "会话图片")
                          }}
                          className="max-h-32 max-w-full cursor-pointer rounded-lg border border-white/10 object-contain transition-opacity hover:opacity-85"
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-stone-300">{assistantName}正在回复…</span>
            )}
          </div>
        ) : voiceBusy && !overlay ? (
          <div
            className="absolute inset-0 grid h-full w-full grid-cols-[26%_1fr_23%] items-center"
            aria-live="polite"
            aria-label={voiceStatus === "recording" ? `正在转写，已录音 ${voiceElapsedLabel}` : "正在完成转写"}
          >
            <div className="flex h-[58%] items-center justify-center gap-[1.5vh] border-r border-border/75 px-[8%]">
              <span
                className="flex h-[6.2vh] w-[6.2vh] flex-shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_0_0.9vh_rgba(217,119,6,0.10)] transition-transform"
                style={{ transform: `scale(${1 + voiceLevel * 0.1})` }}
              >
                {voiceStatus === "recording" ? (
                  <Mic className="h-[3vh] w-[3vh]" />
                ) : (
                  <LoaderCircle className="h-[3vh] w-[3vh] animate-spin" />
                )}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-[0.8vh] whitespace-nowrap text-[1.9vh] text-text-muted">
                  <span className="h-[0.8vh] w-[0.8vh] rounded-full bg-accent" />
                  {voiceStatus === "recording" ? "正在转写" : "正在完成"}
                </span>
                <span className="mt-[0.4vh] block text-[1.8vh] tabular-nums text-text-muted/80">{voiceElapsedLabel}</span>
              </span>
            </div>

            <div className="flex h-[66%] min-w-0 flex-col justify-center px-[5%]">
              <div className="line-clamp-2 min-h-[5.8vh] text-[2.25vh] leading-[1.55] text-text">
                {input || (voiceStatus === "connecting" ? "正在连接语音服务…" : "请开始说话，识别结果会实时显示在这里")}
              </div>
              <div className="mt-[1.2vh] flex h-[2.6vh] w-full items-center overflow-hidden">
                <VoiceLevelWaveform level={voiceLevel} active={voiceStatus === "recording"} />
              </div>
              {voiceError ? <div className="mt-[0.6vh] truncate text-[1.45vh] text-red-500">{voiceError}</div> : null}
            </div>

            <div className="flex h-[58%] items-center justify-evenly border-l border-border/75 px-[5%]">
              <button
                type="button"
                onClick={() => void cancelVoiceInput()}
                className="group flex min-w-[42%] flex-col items-center gap-[0.7vh] text-text-muted transition-colors hover:text-text disabled:cursor-wait disabled:opacity-50"
                disabled={voiceStatus === "transcribing"}
                aria-label="取消录音"
                title="取消录音"
              >
                <span className="flex h-[5.3vh] w-[5.3vh] items-center justify-center rounded-full bg-bg transition-colors group-hover:bg-stone-200">
                  <X className="h-[2.7vh] w-[2.7vh]" />
                </span>
                <span className="text-[1.55vh]">取消</span>
              </button>
              <button
                type="button"
                onClick={() => void finishVoiceInput()}
                className="group flex min-w-[42%] flex-col items-center gap-[0.7vh] text-accent transition-colors disabled:cursor-wait disabled:opacity-60"
                disabled={voiceStatus !== "recording"}
                aria-label="完成转写"
                title="完成转写"
              >
                <span className="flex h-[5.3vh] w-[5.3vh] items-center justify-center rounded-full bg-accent text-white transition-opacity group-hover:opacity-85">
                  {voiceStatus === "transcribing" ? (
                    <LoaderCircle className="h-[2.7vh] w-[2.7vh] animate-spin" />
                  ) : (
                    <Check className="h-[2.9vh] w-[2.9vh] stroke-[2.5]" />
                  )}
                </span>
                <span className="text-[1.55vh]">完成</span>
              </button>
            </div>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={input}
            readOnly={voiceBusy}
            onChange={(e) => {
              setInput(e.target.value)
              setSlashCursor(e.target.selectionStart)
              setSlashSelectedIndex(0)
              setSlashPointerActive(false)
              setSlashCommandError("")
              if (e.target.value.startsWith("/")) {
                setPermissionMenuOpen(false)
                setModelMenuOpen(false)
              }
            }}
            onSelect={(e) => setSlashCursor(e.currentTarget.selectionStart)}
            onFocus={() => void updateDesktopActivityFacts({
              surface: overlay ? "chat-overlay" : "main-chat",
              chat_input_focused: true,
              last_user_interaction_at: new Date().toISOString(),
            })}
            onBlur={() => void updateDesktopActivityFacts({
              surface: overlay ? "chat-overlay" : "main-chat",
              chat_input_focused: false,
            })}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              voiceStatus === "recording"
                ? "正在聆听…"
                : voiceStatus === "connecting"
                  ? "正在连接语音服务…"
                  : voiceStatus === "transcribing"
                    ? "正在完成转写…"
                    : "要求后续变更"
            }
            rows={overlay ? 10 : 1}
            style={
              overlay
                ? {
                    height: "100%",
                    overflow: "hidden",
                    scrollbarWidth: "none",
                    fontSize: standaloneOverlay ? `${11 * overlayFontRatio}cqh` : `${2.2 * overlayFontRatio}vh`,
                  }
                : { height: "100%", scrollbarWidth: "none" }
            }
            className={cn(
              "resize-none overflow-x-hidden overflow-y-hidden bg-transparent outline-none leading-relaxed select-text",
              overlay
                ? cn(
                    "absolute inset-0 box-border h-full max-h-none min-h-0 w-full overflow-hidden text-stone-100 placeholder:text-stone-400/55 [&::-webkit-scrollbar]:hidden",
                    standaloneOverlay ? "px-[8cqh] pb-[8cqh] pt-[8cqh]" : "px-[2.8vh] pt-[2.7vh]",
                  )
                : "absolute inset-0 box-border h-full max-h-none min-h-0 w-full overflow-hidden pl-[2.8vh] pr-[10vh] pt-[2.7vh] text-[2.2vh] text-text placeholder:text-text-muted/65 [&::-webkit-scrollbar]:hidden",
              hideComposerFooter ? (standaloneOverlay ? "" : "pb-[2.7vh]") : "pb-[8.2vh]",
            )}
          />
        )}

        {!hideComposerFooter && !(!overlay && voiceBusy) && (
          <div className={cn("absolute z-20 flex h-[5.4vh] items-center justify-between gap-[1.4vh]", overlay ? "inset-x-[2.4vh] bottom-[1.6vh]" : "bottom-[1.7vh] left-[2.4vh] right-[9.1vh]")}>
          <div className="flex min-w-0 items-center gap-[1.6vh]">
            <button
              type="button"
              onClick={handleFilePick}
              disabled={isDialogMode}
              className={cn(
                "flex h-[4.2vh] w-[4.2vh] flex-shrink-0 items-center justify-center rounded-[1.2vh] transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                overlay ? "text-stone-200/85 hover:bg-white/10 hover:text-white" : "text-text-muted hover:bg-bg hover:text-text",
              )}
              aria-label="添加附件"
              title="添加附件"
            >
              <Plus className="h-[2.8vh] w-[2.8vh]" />
            </button>
            <button
              type="button"
              onClick={togglePermissionMenu}
              className={cn(
                "flex min-w-0 items-center gap-[0.8vh] rounded-[1.2vh] border border-transparent px-[1.15vh] py-[0.8vh] font-medium transition-colors",
                overlay
                  ? "bg-black/15 text-[#ffd21f] hover:bg-yellow-300/10"
                  : "bg-transparent text-[#d99a00] hover:bg-[#fff8df]",
              )}
              aria-expanded={permissionMenuOpen}
              aria-haspopup="menu"
              aria-label={`当前权限: ${activePermission.label}`}
              title={`当前权限: ${activePermission.label}`}
            >
              <ShieldAlert className="h-[2.35vh] w-[2.35vh] flex-shrink-0" />
              <span className="truncate text-[1.85vh]">{activePermission.label}</span>
              <ChevronDown className="h-[1.7vh] w-[1.7vh] flex-shrink-0" />
            </button>
            {!hideOverlayActions && hasDialog && (
              <button
                type="button"
                onClick={toggleOverlayMode}
                className="hidden h-[4.2vh] w-[4.2vh] flex-shrink-0 items-center justify-center rounded-[1.2vh] text-stone-200/85 transition-colors hover:bg-white/10 hover:text-white sm:flex"
                aria-label={isDialogMode ? "切换到输入" : "切换到对话"}
                title={isDialogMode ? "切换到输入" : "切换到对话"}
              >
                {isDialogMode ? <Keyboard className="h-[2.2vh] w-[2.2vh]" /> : <MessageSquare className="h-[2.2vh] w-[2.2vh]" />}
              </button>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-[1.5vh]">
            {outputActive || disabled ? (
              <LoaderCircle className={cn("h-[2.5vh] w-[2.5vh] animate-spin", overlay ? "text-stone-300/80" : "text-text-muted")} aria-label="正在处理" />
            ) : null}
            {voiceInputEnabled && !overlay ? (
              <button
                type="button"
                onClick={() => void toggleVoiceInput()}
                disabled={Boolean(disabled) || voiceStatus === "connecting" || voiceStatus === "transcribing"}
                className={cn(
                  "flex h-[4.2vh] w-[4.2vh] flex-shrink-0 items-center justify-center rounded-full transition-[color,background-color,transform] disabled:cursor-wait",
                  voiceStatus === "recording"
                    ? "bg-red-500/10 text-red-500"
                    : voiceError
                      ? "text-red-500 hover:bg-red-500/10"
                      : "text-text-muted hover:bg-bg hover:text-text",
                )}
                style={{ transform: voiceStatus === "recording" ? `scale(${1 + voiceLevel * 0.12})` : undefined }}
                aria-label={voiceStatus === "recording" ? "停止录音" : "开始语音输入"}
                title={voiceError || (voiceStatus === "recording" ? "停止录音" : "语音输入")}
              >
                {voiceStatus === "connecting" || voiceStatus === "transcribing" ? (
                  <LoaderCircle className="h-[2.4vh] w-[2.4vh] animate-spin" />
                ) : voiceStatus === "recording" ? (
                  <Square className="h-[1.8vh] w-[1.8vh] fill-current" />
                ) : (
                  <Mic className="h-[2.5vh] w-[2.5vh]" />
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggleModelMenu}
              disabled={modelLoading && !modelConfig}
              className={cn(
                "flex max-w-[18vh] items-center gap-[0.8vh] rounded-[1.2vh] px-[0.7vh] py-[0.8vh] text-[1.9vh] font-medium transition-colors disabled:cursor-wait disabled:opacity-60",
                overlay ? "text-stone-200/85 hover:bg-white/10 hover:text-white" : "text-text-muted hover:bg-bg hover:text-text",
              )}
              aria-expanded={modelMenuOpen}
              aria-haspopup="menu"
              aria-label={`模型: ${currentModelLabel}`}
              title={modelButtonTitle}
            >
              <span className="truncate">{currentModelLabel}</span>
              <ChevronDown className="h-[1.7vh] w-[1.7vh] flex-shrink-0" />
            </button>
            {overlay && !hideOverlayActions && (
              <>
                <button
                  type="button"
                  onClick={onHistory}
                  className="hidden h-[4.2vh] w-[4.2vh] items-center justify-center rounded-[1.2vh] text-stone-200/85 transition-colors hover:bg-white/10 hover:text-white sm:flex"
                  aria-label="历史会话"
                  title="历史会话"
                >
                  <History className="h-[2.1vh] w-[2.1vh]" />
                </button>
                {isDialogMode && (
                  <button
                    type="button"
                    onClick={previousOutput}
                    disabled={outputIndex === 0}
                    className="hidden h-[4.2vh] w-[4.2vh] items-center justify-center rounded-[1.2vh] text-stone-200/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 sm:flex"
                    aria-label="上一条"
                    title="上一条"
                  >
                    <ChevronLeft className="h-[2.1vh] w-[2.1vh]" />
                  </button>
                )}
                <button
                  type="button"
                  onPointerDown={handleDragPointerDown}
                  onPointerUp={clearDragTimer}
                  onPointerLeave={clearDragTimer}
                  onPointerCancel={clearDragTimer}
                  onContextMenu={(event) => event.preventDefault()}
                  className="hidden h-[4.2vh] w-[4.2vh] items-center justify-center rounded-[1.2vh] text-stone-200/85 transition-colors hover:bg-white/10 hover:text-white sm:flex"
                  aria-label="长按移动窗口"
                  title="长按移动窗口"
                >
                  <Move className="h-[2.1vh] w-[2.1vh]" />
                </button>
              </>
            )}
            {overlay ? (
              disabled && onAbort ? (
                <StopButton overlay onStop={() => void onAbort()} />
              ) : (
                <SendButton canSend={canSend} disabled={disabled} dialogMode={isDialogMode} overlay onSend={handleSend} />
              )
            ) : null}
          </div>
          </div>
        )}
        {!hideComposerFooter && !overlay && !voiceBusy ? (
          <div className="absolute bottom-[1.5vh] right-[2.4vh] z-30 flex flex-col items-center gap-[0.9vh]">
            <TokenMeter inputTokens={inputTokens} contextTokens={contextTokens} contextWindow={contextWindow} />
            {disabled && onAbort ? (
              <StopButton overlay={false} onStop={() => void onAbort()} />
            ) : (
              <SendButton canSend={canSend} disabled={disabled} dialogMode={isDialogMode} overlay={false} onSend={handleSend} />
            )}
          </div>
        ) : null}
        <AnimatePresence>
          {slashCommandError && !slashMenuOpen && (
            <motion.div
              key="slash-command-error"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
              className={cn(
                "absolute left-[2.8vh] z-30 max-w-[calc(100%-5.6vh)] truncate text-[1.35vh]",
                hideComposerFooter ? "bottom-[1.5vh]" : "bottom-[7.1vh]",
                overlay ? "text-red-200" : "text-red-600",
              )}
            >
              {slashCommandError}
            </motion.div>
          )}
        </AnimatePresence>
        {permissionMenuOpen && (
          <div
            role="menu"
            className={cn(
              "absolute z-30 w-[17.5rem] overflow-y-auto rounded-lg border shadow-lg backdrop-blur-md",
              hideComposerFooter ? "bottom-[2.2vh] left-[2.2vh] max-h-[calc(100%-4.4vh)]" : "bottom-[7.3vh] left-[7.6vh]",
              overlay ? "border-white/12 bg-stone-950/88 text-stone-100" : "border-border bg-card text-text",
            )}
          >
            {permissionOptions.map((option) => {
              const active = option.mode === permissionMode
              const saving = permissionSubmitting === option.mode
              return (
                <button
                  key={option.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={permissionSubmitting !== null}
                  onClick={() => void selectPermissionMode(option.mode)}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors disabled:cursor-wait disabled:opacity-70",
                    active
                      ? overlay
                        ? "bg-yellow-300/12 text-[#ffd21f]"
                        : "bg-[#fff8df] text-[#b77900]"
                      : overlay
                        ? "text-stone-300 hover:bg-white/8 hover:text-stone-100"
                        : "text-text-muted hover:bg-bg hover:text-text",
                  )}
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{saving ? "正在切换..." : option.label}</span>
                    <span className="mt-0.5 block text-xs opacity-75">{option.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {modelMenuOpen && (
          <div
            role="menu"
            className={cn(
              "absolute z-30 w-[20rem] overflow-y-auto rounded-lg border shadow-lg backdrop-blur-md",
              hideComposerFooter
                ? "bottom-[2.2vh] right-[2.2vh] max-h-[calc(100%-4.4vh)] max-w-[calc(100%-4.4vh)]"
                : "bottom-[7.3vh] right-[8.3vh] max-h-[38vh] max-w-[calc(100%-9rem)]",
              overlay ? "border-white/12 bg-stone-950/88 text-stone-100" : "border-border bg-card text-text",
            )}
          >
            {modelError && (
              <div className={cn("px-3 py-2 text-xs", overlay ? "text-red-100" : "text-red-600")}>
                {modelError}
              </div>
            )}
            {modelLoading && !modelConfig ? (
              <div className={cn("px-3 py-3 text-sm", overlay ? "text-stone-300" : "text-text-muted")}>
                正在读取模型...
              </div>
            ) : modelConfig?.options.length ? (
              modelConfig.options.map((option) => {
                const saving = modelSubmitting === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={option.selected}
                    disabled={modelSubmitting !== null}
                    onClick={() => void selectModel(option)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors disabled:cursor-wait disabled:opacity-70",
                      option.selected
                        ? overlay
                          ? "bg-white/10 text-stone-50"
                          : "bg-bg text-text"
                        : overlay
                          ? "text-stone-300 hover:bg-white/8 hover:text-stone-100"
                          : "text-text-muted hover:bg-bg hover:text-text",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {saving ? "正在切换..." : option.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs opacity-75">
                        {option.providerName || option.provider}/{option.modelID}
                        {option.status && option.status !== "active" ? ` · ${option.status}` : ""}
                      </span>
                    </span>
                    {option.selected && <span className="mt-0.5 flex-shrink-0 text-xs opacity-70">当前</span>}
                  </button>
                )
              })
            ) : (
              <div className={cn("px-3 py-3 text-sm", overlay ? "text-stone-300" : "text-text-muted")}>
                没有可用模型
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
