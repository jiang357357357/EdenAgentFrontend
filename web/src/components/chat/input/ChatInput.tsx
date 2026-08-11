import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "../../../lib/utils"
import { updateDesktopActivityFacts } from "../../../lib/desktop-window"
import { DEFAULT_CONTEXT_WINDOW, estimateTextTokens } from "../../../lib/token-usage"
import type { PermissionMode, PromptAttachment, TokenBreakdown, ToolCall } from "../../../types"
import { AttachmentTray } from "./AttachmentTray"
import { ChatComposerFooter } from "./ChatComposerFooter"
import { ChatDialogPanel } from "./ChatDialogPanel"
import { ChatInputMenus } from "./ChatInputMenus"
import { SlashCommandMenu } from "./SlashCommandMenu"
import { VoiceConversationPanel } from "./VoiceConversationPanel"
import { useChatAttachments } from "./hooks/useChatAttachments"
import { useRealtimeVoiceInput } from "./hooks/useRealtimeVoiceInput"
import { useChatSettingsMenus } from "./hooks/useChatSettingsMenus"
import { useSlashCommandMenu } from "./hooks/useSlashCommandMenu"
import type { DialogSegment } from "./types"

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
  halfDuplexOutputActive?: boolean
  contextTokenEstimate?: number
  tokenBreakdown?: TokenBreakdown
  onCompact?: (instructions?: string) => void | Promise<void>
  onAbort?: () => void | Promise<void>
  onNewSession?: () => void | Promise<void>
  onOpenSettings?: () => void
  onOpenMemo?: () => void
  onOpenSelfAwake?: () => void
  onOpenSkills?: () => void
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
  permissionMode = "restricted",
  onPermissionModeChange,
  voiceInputEnabled = false,
  sttConfigId,
  halfDuplexOutputActive = false,
  contextTokenEstimate = 0,
  tokenBreakdown,
  onCompact,
  onAbort,
  onNewSession,
  onOpenSettings,
  onOpenMemo,
  onOpenSelfAwake,
  onOpenSkills,
}: ChatInputProps) {
  const [input, setInput] = useState("")
  const {
    attachments,
    clearAttachments,
    draggingFiles,
    fileInputRef,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileChange,
    handleFilePick,
    handlePaste,
    removeAttachment,
  } = useChatAttachments()
  const {
    activePermission,
    closeMenus,
    currentModel,
    currentModelLabel,
    modelButtonTitle,
    modelConfig,
    modelError,
    modelLoading,
    modelMenuOpen,
    modelSubmitting,
    openModelMenu,
    openPermissionMenu,
    permissionError,
    permissionMenuOpen,
    permissionSubmitting,
    selectModel,
    selectPermissionMode,
    toggleModelMenu,
    togglePermissionMenu,
  } = useChatSettingsMenus({ hideComposerFooter, onPermissionModeChange, permissionMode })
  const dragTimerRef = useRef<number | undefined>(undefined)
  const previousSegmentCountRef = useRef(0)
  const {
    cancelVoiceInput,
    halfDuplexActive,
    halfDuplexPaused,
    halfDuplexWaiting,
    pauseVoiceSession,
    resumeVoiceSession,
    toggleVoiceInput,
    voiceBusy,
    voiceElapsedLabel,
    voiceError,
    voiceLevel,
    voiceStatus,
  } = useRealtimeVoiceInput({
    disabled,
    halfDuplexOutputActive,
    input,
    onSend: (text) => onSend(text, []),
    onStart: closeMenus,
    overlay,
    setInput,
    sttConfigId,
    voiceInputEnabled,
  })
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
  const voicePanelVisible = !overlay && (halfDuplexActive || voiceBusy)
  const canSend = Boolean(input.trim() || attachments.length > 0) && !voiceBusy
  const inputTokens = estimateTextTokens(input)
  const contextWindow = currentModel?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
  const contextTokens = Math.min(contextWindow, contextTokenEstimate + inputTokens)
  const {
    commandError: slashCommandError,
    executeCommand: executeSlashCommand,
    filteredCommands: filteredSlashCommands,
    handleKeyDown,
    handleSend,
    menuOpen: slashMenuOpen,
    menuRef: slashMenuRef,
    optionRefs: slashOptionRefs,
    pointerActive: slashPointerActive,
    selectedIndex: slashSelectedIndex,
    setCommandError: setSlashCommandError,
    setCursor: setSlashCursor,
    setPointerActive: setSlashPointerActive,
    setSelectedIndex: setSlashSelectedIndex,
    textareaRef,
  } = useSlashCommandMenu({
    attachments,
    clearAttachments,
    disabled,
    input,
    isDialogMode,
    onCompact,
    onNewSession,
    onOpenMemo,
    onOpenModelMenu: openModelMenu,
    onOpenPermissionMenu: openPermissionMenu,
    onOpenSelfAwake,
    onOpenSettings,
    onOpenSkills,
    onSend,
    overlay,
    setInput,
    voiceBusy,
  })

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

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10",
        overlay
          ? "bg-transparent p-0 [container-type:size]"
          : "bg-gradient-to-t from-bg via-bg/95 to-transparent pt-[1.2vh] pb-[2.8vh]",
      )}
      style={overlay ? { height: standaloneOverlay ? "100%" : `${overlayHeight ?? (overlayCompact ? 20 : 40)}vh` } : undefined}
    >
      <AttachmentTray attachments={attachments} onRemove={removeAttachment} overlay={overlay} />

      <div className={cn("relative", overlay && "h-full")}>
        <AnimatePresence>
          {slashMenuOpen && (
            <SlashCommandMenu
              commands={filteredSlashCommands}
              menuRef={slashMenuRef}
              onExecute={executeSlashCommand}
              onPointerActiveChange={setSlashPointerActive}
              onSelectedIndexChange={setSlashSelectedIndex}
              optionRefs={slashOptionRefs}
              overlay={overlay}
              pointerActive={slashPointerActive}
              selectedIndex={slashSelectedIndex}
            />
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
          <ChatDialogPanel
            assistantName={assistantName}
            currentOutput={currentOutput}
            fontRatio={overlayFontRatio}
            onAdvance={advanceOutput}
            onPreviewImage={onPreviewImage}
            standaloneOverlay={standaloneOverlay}
          />
        ) : voicePanelVisible ? (
          <VoiceConversationPanel
            assistantName={assistantName}
            elapsedLabel={voiceElapsedLabel}
            error={voiceError}
            halfDuplexOutputActive={halfDuplexOutputActive}
            input={input}
            level={voiceLevel}
            onCancel={cancelVoiceInput}
            onPause={pauseVoiceSession}
            onResume={resumeVoiceSession}
            paused={halfDuplexPaused}
            status={voiceStatus}
            waiting={halfDuplexWaiting}
          />
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
              if (e.target.value.startsWith("/")) closeMenus()
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
                : { scrollbarWidth: "none" }
            }
            className={cn(
              "resize-none overflow-x-hidden overflow-y-hidden bg-transparent outline-none leading-relaxed select-text",
              overlay
                ? cn(
                    "absolute inset-0 box-border h-full max-h-none min-h-0 w-full overflow-hidden text-stone-100 placeholder:text-stone-400/55 [&::-webkit-scrollbar]:hidden",
                    standaloneOverlay ? "px-[8cqh] pb-[8cqh] pt-[8cqh]" : "px-[2.8vh] pt-[2.7vh]",
                  )
                : "relative block box-border min-h-[9.3vh] w-full overflow-hidden pl-[2.8vh] pr-[10vh] pt-[2.7vh] text-[2.2vh] text-text placeholder:text-text-muted/65 [&::-webkit-scrollbar]:hidden",
              hideComposerFooter
                ? (standaloneOverlay ? "" : "pb-[2.7vh]")
                : overlay
                  ? "pb-[8.2vh]"
                  : "mb-[6.7vh] pb-[1.5vh]",
            )}
          />
        )}

        <ChatComposerFooter
          canSend={canSend}
          contextTokens={contextTokens}
          contextWindow={contextWindow}
          disabled={disabled}
          hasDialog={hasDialog}
          hideComposerFooter={hideComposerFooter}
          hideOverlayActions={hideOverlayActions}
          inputTokens={inputTokens}
          tokenBreakdown={tokenBreakdown}
          isDialogMode={isDialogMode}
          modelButtonTitle={modelButtonTitle}
          modelConfigAvailable={Boolean(modelConfig)}
          modelLabel={currentModelLabel}
          modelLoading={modelLoading}
          modelMenuOpen={modelMenuOpen}
          onAbort={onAbort}
          onDragPointerCancel={clearDragTimer}
          onDragPointerDown={handleDragPointerDown}
          onFilePick={handleFilePick}
          onHistory={onHistory}
          onPreviousOutput={previousOutput}
          onSend={handleSend}
          onToggleModelMenu={toggleModelMenu}
          onToggleOverlayMode={toggleOverlayMode}
          onTogglePermissionMenu={togglePermissionMenu}
          onToggleVoiceInput={() => void toggleVoiceInput()}
          outputActive={outputActive}
          outputIndex={outputIndex}
          overlay={overlay}
          permissionLabel={activePermission.label}
          permissionMenuOpen={permissionMenuOpen}
          voiceBusy={voiceBusy}
          voiceError={voiceError}
          voiceInputEnabled={voiceInputEnabled}
          voiceLevel={voiceLevel}
          voicePanelVisible={voicePanelVisible}
          voiceStatus={voiceStatus}
        />
        <AnimatePresence>
          {permissionError && !permissionMenuOpen && (
            <motion.div
              key="permission-mode-error"
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
              {permissionError}
            </motion.div>
          )}
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
        <ChatInputMenus
          hideComposerFooter={hideComposerFooter}
          modelConfig={modelConfig}
          modelError={modelError}
          modelLoading={modelLoading}
          modelMenuOpen={modelMenuOpen}
          modelSubmitting={modelSubmitting}
          onSelectModel={(option) => void selectModel(option)}
          onSelectPermission={(mode) => void selectPermissionMode(mode)}
          overlay={overlay}
          permissionMenuOpen={permissionMenuOpen}
          permissionMode={permissionMode}
          permissionSubmitting={permissionSubmitting}
        />
        </div>
      </div>
    </div>
  )
}
