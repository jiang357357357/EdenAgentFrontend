import { ChevronDown, ChevronLeft, History, Keyboard, LoaderCircle, MessageSquare, Mic, Move, Plus, ShieldAlert, Square } from "lucide-react"

import type { RealtimeSTTStatus } from "../../../lib/realtime-stt"
import type { TokenBreakdown } from "../../../types"
import { cn } from "../../../lib/utils"
import { SendButton, StopButton, TokenMeter } from "./ChatInputControls"

interface ChatComposerFooterProps {
  canSend: boolean
  contextTokens: number
  contextWindow: number
  disabled?: boolean
  hasDialog: boolean
  hideComposerFooter: boolean
  hideOverlayActions: boolean
  inputTokens: number
  tokenBreakdown?: TokenBreakdown
  isDialogMode: boolean
  modelButtonTitle: string
  modelConfigAvailable: boolean
  modelLabel: string
  modelLoading: boolean
  modelMenuOpen: boolean
  onAbort?: () => void | Promise<void>
  onDragPointerCancel: () => void
  onDragPointerDown: () => void
  onFilePick: () => void
  onHistory?: () => void
  onPreviousOutput: () => void
  onSend: () => void
  onToggleModelMenu: () => void
  onToggleOverlayMode: () => void
  onTogglePermissionMenu: () => void
  onToggleVoiceInput: () => void
  outputActive: boolean
  outputIndex: number
  overlay: boolean
  permissionLabel: string
  permissionMenuOpen: boolean
  voiceBusy: boolean
  voiceError: string
  voiceInputEnabled: boolean
  voiceLevel: number
  voicePanelVisible: boolean
  voiceStatus: RealtimeSTTStatus
}

export function ChatComposerFooter({
  canSend,
  contextTokens,
  contextWindow,
  disabled,
  hasDialog,
  hideComposerFooter,
  hideOverlayActions,
  inputTokens,
  tokenBreakdown,
  isDialogMode,
  modelButtonTitle,
  modelConfigAvailable,
  modelLabel,
  modelLoading,
  modelMenuOpen,
  onAbort,
  onDragPointerCancel,
  onDragPointerDown,
  onFilePick,
  onHistory,
  onPreviousOutput,
  onSend,
  onToggleModelMenu,
  onToggleOverlayMode,
  onTogglePermissionMenu,
  onToggleVoiceInput,
  outputActive,
  outputIndex,
  overlay,
  permissionLabel,
  permissionMenuOpen,
  voiceBusy,
  voiceError,
  voiceInputEnabled,
  voiceLevel,
  voicePanelVisible,
  voiceStatus,
}: ChatComposerFooterProps) {
  if (hideComposerFooter) return null

  return (
    <>
      {!voicePanelVisible && (
        <div className={cn("absolute z-20 flex h-[5.4vh] items-center justify-between gap-[1.4vh]", overlay ? "inset-x-[2.4vh] bottom-[1.6vh]" : "bottom-[1.7vh] left-[2.4vh] right-[9.1vh]") }>
          <div className="flex min-w-0 items-center gap-[1.6vh]">
            <button type="button" onClick={onFilePick} disabled={isDialogMode} className={cn("flex h-[4.2vh] w-[4.2vh] flex-shrink-0 items-center justify-center rounded-[1.2vh] transition-colors disabled:cursor-not-allowed disabled:opacity-35", overlay ? "text-stone-200/85 hover:bg-white/10 hover:text-white" : "text-text-muted hover:bg-bg hover:text-text")} aria-label="添加附件" title="添加附件">
              <Plus className="h-[2.8vh] w-[2.8vh]" />
            </button>
            <button type="button" onClick={onTogglePermissionMenu} className={cn("flex min-w-0 items-center gap-[0.8vh] rounded-[1.2vh] border border-transparent px-[1.15vh] py-[0.8vh] font-medium transition-colors", overlay ? "bg-black/15 text-[#ffd21f] hover:bg-yellow-300/10" : "bg-transparent text-[#d99a00] hover:bg-[#fff8df]")} aria-expanded={permissionMenuOpen} aria-haspopup="menu" aria-label={`当前权限: ${permissionLabel}`} title={`当前权限: ${permissionLabel}`}>
              <ShieldAlert className="h-[2.35vh] w-[2.35vh] flex-shrink-0" />
              <span className="truncate text-[1.85vh]">{permissionLabel}</span>
              <ChevronDown className="h-[1.7vh] w-[1.7vh] flex-shrink-0" />
            </button>
            {!hideOverlayActions && hasDialog && (
              <button type="button" onClick={onToggleOverlayMode} className="hidden h-[4.2vh] w-[4.2vh] flex-shrink-0 items-center justify-center rounded-[1.2vh] text-stone-200/85 transition-colors hover:bg-white/10 hover:text-white sm:flex" aria-label={isDialogMode ? "切换到输入" : "切换到对话"} title={isDialogMode ? "切换到输入" : "切换到对话"}>
                {isDialogMode ? <Keyboard className="h-[2.2vh] w-[2.2vh]" /> : <MessageSquare className="h-[2.2vh] w-[2.2vh]" />}
              </button>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-[1.5vh]">
            {outputActive || disabled ? <LoaderCircle className={cn("h-[2.5vh] w-[2.5vh] animate-spin", overlay ? "text-stone-300/80" : "text-text-muted")} aria-label="正在处理" /> : null}
            {voiceInputEnabled && !overlay ? (
              <button type="button" onClick={onToggleVoiceInput} disabled={Boolean(disabled) || voiceStatus === "connecting" || voiceStatus === "transcribing"} className={cn("flex h-[4.2vh] w-[4.2vh] flex-shrink-0 items-center justify-center rounded-full transition-[color,background-color,transform] disabled:cursor-wait", voiceStatus === "recording" ? "bg-red-500/10 text-red-500" : voiceError ? "text-red-500 hover:bg-red-500/10" : "text-text-muted hover:bg-bg hover:text-text")} style={{ transform: voiceStatus === "recording" ? `scale(${1 + voiceLevel * 0.12})` : undefined }} aria-label={voiceStatus === "recording" ? "停止录音" : "开始语音输入"} title={voiceError || (voiceStatus === "recording" ? "停止录音" : "语音输入")}>
                {voiceStatus === "connecting" || voiceStatus === "transcribing" ? <LoaderCircle className="h-[2.4vh] w-[2.4vh] animate-spin" /> : voiceStatus === "recording" ? <Square className="h-[1.8vh] w-[1.8vh] fill-current" /> : <Mic className="h-[2.5vh] w-[2.5vh]" />}
              </button>
            ) : null}
            <button type="button" onClick={onToggleModelMenu} disabled={modelLoading && !modelConfigAvailable} className={cn("flex max-w-[18vh] items-center gap-[0.8vh] rounded-[1.2vh] px-[0.7vh] py-[0.8vh] text-[1.9vh] font-medium transition-colors disabled:cursor-wait disabled:opacity-60", overlay ? "text-stone-200/85 hover:bg-white/10 hover:text-white" : "text-text-muted hover:bg-bg hover:text-text")} aria-expanded={modelMenuOpen} aria-haspopup="menu" aria-label={`模型: ${modelLabel}`} title={modelButtonTitle}>
              <span className="truncate">{modelLabel}</span>
              <ChevronDown className="h-[1.7vh] w-[1.7vh] flex-shrink-0" />
            </button>
            {overlay && !hideOverlayActions && (
              <>
                <button type="button" onClick={onHistory} className="hidden h-[4.2vh] w-[4.2vh] items-center justify-center rounded-[1.2vh] text-stone-200/85 transition-colors hover:bg-white/10 hover:text-white sm:flex" aria-label="历史会话" title="历史会话"><History className="h-[2.1vh] w-[2.1vh]" /></button>
                {isDialogMode && <button type="button" onClick={onPreviousOutput} disabled={outputIndex === 0} className="hidden h-[4.2vh] w-[4.2vh] items-center justify-center rounded-[1.2vh] text-stone-200/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 sm:flex" aria-label="上一条" title="上一条"><ChevronLeft className="h-[2.1vh] w-[2.1vh]" /></button>}
                <button type="button" onPointerDown={onDragPointerDown} onPointerUp={onDragPointerCancel} onPointerLeave={onDragPointerCancel} onPointerCancel={onDragPointerCancel} onContextMenu={(event) => event.preventDefault()} className="hidden h-[4.2vh] w-[4.2vh] items-center justify-center rounded-[1.2vh] text-stone-200/85 transition-colors hover:bg-white/10 hover:text-white sm:flex" aria-label="长按移动窗口" title="长按移动窗口"><Move className="h-[2.1vh] w-[2.1vh]" /></button>
              </>
            )}
            {overlay ? disabled && onAbort ? <StopButton overlay onStop={() => void onAbort()} /> : <SendButton canSend={canSend} disabled={disabled} dialogMode={isDialogMode} overlay onSend={onSend} /> : null}
          </div>
        </div>
      )}

      {!overlay && !voicePanelVisible ? (
        <div className="absolute bottom-[1.5vh] right-[2.4vh] z-30 flex flex-col items-center gap-[0.9vh]">
          <TokenMeter inputTokens={inputTokens} contextTokens={contextTokens} contextWindow={contextWindow} breakdown={tokenBreakdown} />
          {disabled && onAbort ? <StopButton overlay={false} onStop={() => void onAbort()} /> : <SendButton canSend={canSend} disabled={disabled} dialogMode={isDialogMode} overlay={false} onSend={onSend} />}
        </div>
      ) : null}
    </>
  )
}
