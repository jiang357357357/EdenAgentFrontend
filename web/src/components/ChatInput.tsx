import { useState, useRef, useEffect } from "react"
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  FileText,
  History,
  Keyboard,
  LoaderCircle,
  MessageSquare,
  Move,
  Plus,
  ShieldAlert,
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
import { cn } from "../lib/utils"
import { MarkdownContent } from "./MarkdownContent"
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
  overlayOpacity?: number
  overlayHeight?: number
  permissionMode?: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => Promise<void>
}

const permissionOptions: Array<{ mode: PermissionMode; label: string; description: string }> = [
  { mode: "full_access", label: "完全访问", description: "自动允许工具权限" },
  { mode: "ask", label: "询问授权", description: "写入、命令等操作前确认" },
]

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
  overlayOpacity = 76,
  overlayHeight,
  permissionMode = "full_access",
  onPermissionModeChange,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragTimerRef = useRef<number | undefined>(undefined)
  const previousSegmentCountRef = useRef(0)
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
  const canSend = Boolean(input.trim() || attachments.length > 0)
  const activePermission = permissionOptions.find((option) => option.mode === permissionMode) ?? permissionOptions[0]
  const currentModel = modelConfig?.current ?? modelConfig?.options.find((option) => option.selected) ?? null
  const currentModelLabel = currentModel?.label || (modelLoading ? "..." : "模型")
  const modelButtonTitle = modelError
    ? `模型配置读取失败: ${modelError}`
    : currentModel
      ? `模型: ${currentModel.label} (${currentModel.providerName || currentModel.provider}/${currentModel.modelID})`
      : "模型"

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
  }, [])

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

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || disabled) return
    onSend(input.trim(), attachments)
    setInput("")
    setAttachments([])
  }

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
        "sticky bottom-0 z-10",
        overlay
          ? "bg-transparent p-0"
          : "bg-gradient-to-t from-bg via-bg/95 to-transparent pt-[1.2vh] pb-[2.8vh]",
      )}
      style={overlay ? { height: `${overlayHeight ?? (overlayCompact ? 20 : 40)}vh` } : undefined}
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

      <div
        style={overlay ? { backgroundColor: `rgba(28, 25, 23, ${Math.max(30, Math.min(95, overlayOpacity)) / 100})` } : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "transition-colors",
          overlay
            ? cn(
                "relative h-full overflow-hidden rounded-[3.3vh] border bg-stone-950/30 shadow-none backdrop-blur-md focus-within:border-white/25",
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
            className="absolute inset-0 box-border h-full w-full cursor-pointer overflow-y-auto overflow-x-hidden px-[2.8vh] pt-[2.7vh] pb-[8.2vh] text-left text-[1.72vh] leading-relaxed text-stone-100 [overflow-wrap:anywhere] [&::-webkit-scrollbar]:hidden"
          >
            {currentOutput ? (
              <div>
                {currentOutput.runtimeTrace && (
                  <details
                    className="mb-3 rounded-lg border border-teal-200/15 bg-teal-300/10 px-3 py-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <summary className="cursor-pointer select-none text-[11px] tracking-[0.14em] text-teal-100/85">
                      运行过程
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-stone-200 [overflow-wrap:anywhere]">
                      {currentOutput.runtimeTrace}
                    </div>
                  </details>
                )}
                {currentOutput.thinking && (
                  <details
                    className="mb-3 rounded-lg border border-sky-200/15 bg-sky-300/10 px-3 py-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <summary className="cursor-pointer select-none text-[11px] tracking-[0.14em] text-sky-100/85">
                      思考
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-stone-200 [overflow-wrap:anywhere]">
                      {currentOutput.thinking}
                    </div>
                  </details>
                )}
                {currentOutput.tool && (
                  <details
                    className="mb-3 rounded-lg border border-emerald-200/15 bg-emerald-300/10 px-3 py-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <summary className="cursor-pointer select-none text-[11px] tracking-[0.14em] text-emerald-100/85">
                      工具: {currentOutput.tool.name}
                    </summary>
                    <div className="mt-2 grid gap-2 text-xs text-stone-200">
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
        ) : (
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="要求后续变更"
            rows={overlay ? 10 : 1}
            style={overlay ? { height: "100%", overflow: "hidden", scrollbarWidth: "none" } : { height: "100%", scrollbarWidth: "none" }}
            className={cn(
              "resize-none overflow-x-hidden overflow-y-hidden bg-transparent outline-none leading-relaxed select-text",
              overlay
                ? "absolute inset-0 box-border h-full max-h-none min-h-0 w-full overflow-hidden px-[2.8vh] pt-[2.7vh] pb-[8.2vh] text-[2.2vh] text-stone-100 placeholder:text-stone-400/55 [&::-webkit-scrollbar]:hidden"
                : "absolute inset-0 box-border h-full max-h-none min-h-0 w-full overflow-hidden px-[2.8vh] pt-[2.7vh] pb-[8.2vh] text-[2.2vh] text-text placeholder:text-text-muted/65 [&::-webkit-scrollbar]:hidden",
            )}
          />
        )}

        <div className={cn("absolute z-20 flex h-[5.4vh] items-center justify-between gap-[1.4vh]", overlay ? "inset-x-[2.4vh] bottom-[1.6vh]" : "inset-x-[2.4vh] bottom-[1.7vh]")}>
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
            <motion.button
              type="button"
              initial={false}
              animate={{
                scale: canSend ? 1 : 0.96,
                opacity: canSend ? 1 : 0.86,
              }}
              onClick={handleSend}
              disabled={disabled || !canSend || isDialogMode}
              className={cn(
                "flex h-[5.2vh] w-[5.2vh] flex-shrink-0 items-center justify-center rounded-full shadow-none transition-colors disabled:cursor-not-allowed",
                overlay
                  ? "bg-stone-300/70 text-stone-800 hover:bg-stone-200 disabled:bg-stone-300/50 disabled:text-stone-700/70"
                  : "bg-stone-200 text-text-muted hover:bg-accent hover:text-white disabled:bg-stone-200/70 disabled:text-text-muted/60",
              )}
              aria-label="发送"
              title="发送"
            >
              <ArrowUp className="h-[2.7vh] w-[2.7vh]" />
            </motion.button>
          </div>
        </div>
        {permissionMenuOpen && (
          <div
            role="menu"
            className={cn(
              "absolute left-[7.6vh] bottom-[7.3vh] z-30 w-[17.5rem] overflow-hidden rounded-lg border shadow-lg backdrop-blur-md",
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
              "absolute right-[8.3vh] bottom-[7.3vh] z-30 max-h-[38vh] w-[20rem] max-w-[calc(100%-9rem)] overflow-y-auto rounded-lg border shadow-lg backdrop-blur-md",
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
  )
}
