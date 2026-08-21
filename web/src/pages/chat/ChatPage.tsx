import { File, Lock, LockOpen, MessageSquare, X } from "lucide-react"
import { motion } from "motion/react"
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CharacterPanel } from "../../components/character"
import { ChatInput } from "../../components/chat/input"
import { DirectorPlanCard, MessageBubble, RunReviewCard } from "../../components/chat/message"
import { PermissionRequestCard } from "../../components/requests"
import { Sidebar } from "../../components/layout"
import { resolveCoreAssetUrl, type ActiveCharacterAction, type AuthUser, type CoreAssistant } from "../../lib/auth"
import {
  DEFAULT_PET_SETTINGS,
  getDesktopPetSettings,
  listenDesktopPetSettings,
  type PetSettings,
} from "../../lib/desktop-window"
import { useTTSSpeech, type SpeechSegment } from "../../hooks/useTTSSpeech"
import { usePerformanceDiagnostics } from "../../hooks/usePerformanceDiagnostics"
import { startCompanionDirectorRun } from "../../lib/companion-director-state"
import { estimateConversationTokens } from "../../lib/token-usage"
import { readWorkspaceFile, type WorkspaceEntry, type WorkspaceFileContent } from "../../lib/agent-client"
import { messageGroupPosition, messageRenderKey } from "../../lib/message-grouping"
import { buildRunReviewIndex } from "../../lib/run-review"
import { cn } from "../../lib/utils"
import type {
  PendingPermission,
  MessageData,
  PermissionMode,
  PromptAttachment,
  Session,
  SubagentThreadDetails,
} from "../../types"

const fullScreenMotion = {
  initial: { opacity: 0, x: -18, filter: "blur(3px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -26, filter: "blur(3px)" },
}

const screenTransition = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
} as const

const VISIBLE_CONVERSATION_TURNS = 10
const CONVERSATION_TURN_STEP = 5

function conversationTurnStarts(messages: MessageData[]): number[] {
  if (messages.length === 0) return []
  const starts = messages.flatMap((message, index) => (message.role === "user" ? [index] : []))
  if (starts.length === 0) return [0]
  // Runtime/compaction records can precede the first visible user message.
  // Keep that prelude attached to the first complete conversation turn.
  starts[0] = 0
  return starts
}

interface ChatPageProps {
  sessions: Session[]
  activeSessionId: string
  activeSession?: Session
  currentUser?: AuthUser | null
  assistant?: CoreAssistant | null
  assistantError?: string
  activeCharacterAction?: ActiveCharacterAction
  isThinking: boolean
  connectionError?: string
  activePendingPermissions: PendingPermission[]
  messagesScrollRef: React.RefObject<HTMLDivElement | null>
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  autoScrollEnabled: boolean
  onAutoScrollChange: (enabled: boolean) => void
  onLoadOlderMessages: () => Promise<void>
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => Promise<void>
  onRenameSession: (id: string, title: string) => Promise<void>
  onNewSession: () => void
  onSendMessage: (content: string, attachments: PromptAttachment[]) => Promise<void>
  onCompact: (instructions?: string) => Promise<void>
  onAbort: () => Promise<void>
  onFollowupSubagent: (target: string, message: string) => Promise<unknown>
  onGetSubagentDetails: (target: string) => Promise<SubagentThreadDetails>
  onInterruptSubagent: (target: string) => Promise<unknown>
  onPermissionReply: (requestID: string, reply: "once" | "always" | "reject", message?: string) => Promise<void>
  permissionMode: PermissionMode
  onPermissionModeChange: (mode: PermissionMode) => Promise<void>
  onPreviewImage: (src: string, alt?: string) => void
  onLogout: () => Promise<void> | void
  onOpenAssistantSwitcher: () => void
  onOpenDutyAssistantSwitcher: () => void
  onOpenSessionAssistantSwitcher: () => void
  onOpenSettings: () => void
  onOpenSelfAwake: () => void
  onOpenMemo: () => void
  onOpenSkills: () => void
  onOpenConnectors: () => void
}

export function ChatPage({
  sessions,
  activeSessionId,
  activeSession,
  currentUser,
  assistant,
  assistantError,
  activeCharacterAction,
  isThinking,
  connectionError,
  activePendingPermissions,
  messagesScrollRef,
  messagesEndRef,
  autoScrollEnabled,
  onAutoScrollChange,
  onLoadOlderMessages,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onNewSession,
  onSendMessage,
  onCompact,
  onAbort,
  onFollowupSubagent,
  onGetSubagentDetails,
  onInterruptSubagent,
  onPermissionReply,
  permissionMode,
  onPermissionModeChange,
  onPreviewImage,
  onOpenAssistantSwitcher,
  onOpenDutyAssistantSwitcher,
  onOpenSettings,
  onOpenSelfAwake,
  onOpenMemo,
  onOpenSkills,
  onOpenConnectors,
}: ChatPageProps) {
  const [slashCommandNotices, setSlashCommandNotices] = useState<
    Array<{ id: number; sessionID?: string; command: string; afterMessageID?: string }>
  >([])
  const taskRunning = Boolean(
    isThinking ||
      activeSession?.coordinationBatches?.some((batch) =>
        ["collecting", "ready", "aggregating"].includes(batch.status),
      ) ||
      activeSession?.agentThreads?.some((thread) =>
        ["created", "queued", "running", "waiting"].includes(thread.status),
      ),
  )
  const [petSettings, setPetSettings] = useState<PetSettings>(DEFAULT_PET_SETTINGS)
  const [openSessionIds, setOpenSessionIds] = useState<string[]>(() => (activeSessionId ? [activeSessionId] : []))
  const [openFiles, setOpenFiles] = useState<WorkspaceEntry[]>([])
  const [activeTab, setActiveTab] = useState(() => (activeSessionId ? `session:${activeSessionId}` : ""))
  const [fileContents, setFileContents] = useState<Record<string, WorkspaceFileContent>>({})
  const [fileLoadingPath, setFileLoadingPath] = useState("")
  const [fileError, setFileError] = useState("")
  const [visibleWindowStartID, setVisibleWindowStartID] = useState<string>()
  const pendingOlderWindowRef = useRef(false)
  const messageAnchorRefs = useRef(new Map<string, HTMLSpanElement>())
  const windowScrollAdjustmentRef = useRef<{ anchorID: string; viewportTop: number } | undefined>(undefined)
  const assistantName = assistant?.name || assistant?.character?.name || "助手"
  const assistantInitial = assistantName.trim().slice(0, 1) || "助"
  const assistantAvatarUrl = resolveCoreAssetUrl(assistant?.character?.avatar_url)
  const userAvatarUrl = resolveCoreAssetUrl(currentUser?.avatar_url)
  const messages = activeSession?.messages ?? []
  const turnStarts = useMemo(() => conversationTurnStarts(messages), [messages])
  const anchoredTurnIndex = visibleWindowStartID
    ? turnStarts.findIndex((messageIndex) => messages[messageIndex]?.id === visibleWindowStartID)
    : -1
  const latestWindowStart = Math.max(0, turnStarts.length - VISIBLE_CONVERSATION_TURNS)
  const visibleTurnStart = anchoredTurnIndex >= 0 ? anchoredTurnIndex : latestWindowStart
  const visibleTurnEnd = Math.min(turnStarts.length, visibleTurnStart + VISIBLE_CONVERSATION_TURNS)
  const visibleMessageStart = turnStarts[visibleTurnStart] ?? 0
  const visibleMessageEnd = turnStarts[visibleTurnEnd] ?? messages.length

  useEffect(() => {
    setVisibleWindowStartID(undefined)
    pendingOlderWindowRef.current = false
    windowScrollAdjustmentRef.current = undefined
  }, [activeSessionId])

  const moveConversationWindow = (direction: "older" | "newer") => {
    const element = messagesScrollRef.current
    if (!element || turnStarts.length === 0) return false
    const nextStart =
      direction === "older"
        ? Math.max(0, visibleTurnStart - CONVERSATION_TURN_STEP)
        : Math.min(latestWindowStart, visibleTurnStart + CONVERSATION_TURN_STEP)
    if (nextStart === visibleTurnStart) return false
    const anchorID =
      direction === "older"
        ? renderedMessages[0]?.id
        : messages[turnStarts[nextStart]]?.id
    const anchor = anchorID ? messageAnchorRefs.current.get(anchorID) : undefined
    if (anchorID && anchor) {
      windowScrollAdjustmentRef.current = { anchorID, viewportTop: anchor.getBoundingClientRect().top }
    }
    setVisibleWindowStartID(nextStart === latestWindowStart ? undefined : messages[turnStarts[nextStart]]?.id)
    return true
  }

  useLayoutEffect(() => {
    const adjustment = windowScrollAdjustmentRef.current
    const element = messagesScrollRef.current
    if (!adjustment || !element) return
    const anchor = messageAnchorRefs.current.get(adjustment.anchorID)
    if (anchor) {
      element.scrollTop += anchor.getBoundingClientRect().top - adjustment.viewportTop
    }
    windowScrollAdjustmentRef.current = undefined
  }, [visibleWindowStartID, messagesScrollRef])

  useEffect(() => {
    if (!pendingOlderWindowRef.current || !visibleWindowStartID) return
    if (anchoredTurnIndex <= 0) return
    pendingOlderWindowRef.current = false
    moveConversationWindow("older")
  }, [anchoredTurnIndex, messages.length, visibleWindowStartID])

  useEffect(() => {
    const resetWorkspaceFiles = () => {
      setOpenFiles([])
      setFileContents({})
      setFileLoadingPath("")
      setFileError("")
      setActiveTab(activeSessionId ? `session:${activeSessionId}` : "")
    }
    window.addEventListener("monagent:workspace-changed", resetWorkspaceFiles)
    return () => window.removeEventListener("monagent:workspace-changed", resetWorkspaceFiles)
  }, [activeSessionId])

  usePerformanceDiagnostics({
    messages: messages.length,
    segments: messages.reduce((total, message) => total + (message.segments?.length ?? 0), 0),
    streaming: isThinking,
  })

  useEffect(() => {
    const handleSlashCommand = (event: Event) => {
      const command = String((event as CustomEvent<{ command?: string }>).detail?.command ?? "").trim()
      if (!command) return
      // /compact is persisted by the server so it remains ordered across refreshes
      // and can be tied to the runtime message created by that request.
      if (command === "/compact" || command.startsWith("/compact ")) return
      setSlashCommandNotices((current) => [
        ...current.slice(-19),
        { id: Date.now(), sessionID: activeSessionId, command, afterMessageID: messages.at(-1)?.id },
      ])
    }
    window.addEventListener("monagent:slash-command-executed", handleSlashCommand)
    return () => window.removeEventListener("monagent:slash-command-executed", handleSlashCommand)
  }, [activeSessionId, messages])

  useEffect(() => {
    if (!activeSessionId) return
    setOpenSessionIds((current) => (current.includes(activeSessionId) ? current : [...current, activeSessionId]))
    setActiveTab(`session:${activeSessionId}`)
  }, [activeSessionId])

  const activeFilePath = activeTab.startsWith("file:") ? activeTab.slice(5) : ""
  const activeFile = openFiles.find((file) => file.path === activeFilePath)
  const activeFileContent = activeFilePath ? fileContents[activeFilePath] : undefined

  useEffect(() => {
    if (!activeFilePath || activeFileContent) return
    let cancelled = false
    setFileLoadingPath(activeFilePath)
    setFileError("")
    void readWorkspaceFile(activeFilePath)
      .then((content) => {
        if (!cancelled) setFileContents((current) => ({ ...current, [activeFilePath]: content }))
      })
      .catch((error) => {
        if (!cancelled) setFileError(error instanceof Error ? error.message : "读取文件失败")
      })
      .finally(() => {
        if (!cancelled) setFileLoadingPath("")
      })
    return () => {
      cancelled = true
    }
  }, [activeFileContent, activeFilePath])

  const activeSlashCommandNotices = slashCommandNotices.filter((item) => item.sessionID === activeSessionId)
  const participantCount = activeSession?.participants?.length ?? 0
  const lastUserMessageIndex = messages.reduce(
    (lastIndex, message, index) => (message.role === "user" ? index : lastIndex),
    -1,
  )
  const lastUserMessageID = messages[lastUserMessageIndex]?.id
  const displayedDirectorRun = useMemo(() => {
    if (participantCount <= 1) return undefined
    const persisted = activeSession?.directorRun
    if (persisted && (!persisted.userMessageID || persisted.userMessageID === lastUserMessageID)) {
      return persisted
    }
    return isThinking ? startCompanionDirectorRun(participantCount, lastUserMessageID) : undefined
  }, [activeSession?.directorRun, isThinking, lastUserMessageID, participantCount])
  const visibleTokenEstimate = useMemo(() => estimateConversationTokens(messages), [messages])
  const contextTokenEstimate = activeSession?.contextTokens ?? visibleTokenEstimate
  const soloTTSConfigId = participantCount === 1
    ? activeSession?.participants?.[0]?.ttsConfigID
    : undefined
  const messageSpeechSegments = (message?: MessageData): SpeechSegment[] => {
    if (!message) return []
    if (message.segments?.length) {
      return message.segments.flatMap((segment) => {
        if (segment.type !== "text") return []
        return segment.content.trim()
          ? [
              {
                id: segment.id,
                messageId: message.id,
                text: segment.content,
                state: segment.state,
                streamEpoch: message.speechEpoch ?? 0,
                streamResetReason: message.speechResetReason,
                configId: message.speaker?.ttsConfigID ?? soloTTSConfigId,
              },
            ]
          : []
      })
    }
    if (!message.content) return []
    return [
      {
        id: `${message.id}:content`,
        messageId: message.id,
        text: message.content,
        state: message.isStreaming ? "streaming" : "done",
        streamEpoch: message.speechEpoch ?? 0,
        streamResetReason: message.speechResetReason,
        configId: message.speaker?.ttsConfigID ?? soloTTSConfigId,
      },
    ]
  }
  const speechSegments = useMemo(
    () => messages.filter((message) => message.role === "assistant").flatMap(messageSpeechSegments),
    [messages],
  )
  const openWorkspaceFile = (entry: WorkspaceEntry) => {
    setOpenFiles((current) => (current.some((file) => file.path === entry.path) ? current : [...current, entry]))
    setActiveTab(`file:${entry.path}`)
  }
  const openWorkspaceSession = (sessionId: string) => {
    setOpenSessionIds((current) => (current.includes(sessionId) ? current : [...current, sessionId]))
    setActiveTab(`session:${sessionId}`)
    onSelectSession(sessionId)
  }
  const closeWorkspaceFile = (path: string) => {
    const next = openFiles.filter((file) => file.path !== path)
    setOpenFiles(next)
    if (activeTab === `file:${path}`) {
      const fallbackSession = openSessionIds.at(-1)
      setActiveTab(fallbackSession ? `session:${fallbackSession}` : next.length ? `file:${next.at(-1)!.path}` : "")
      if (fallbackSession && fallbackSession !== activeSessionId) onSelectSession(fallbackSession)
    }
  }
  const closeWorkspaceSession = (sessionId: string) => {
    const next = openSessionIds.filter((id) => id !== sessionId)
    setOpenSessionIds(next)
    if (activeTab === `session:${sessionId}`) {
      const fallbackSession = next.at(-1)
      setActiveTab(
        fallbackSession ? `session:${fallbackSession}` : openFiles.length ? `file:${openFiles.at(-1)!.path}` : "",
      )
      if (fallbackSession && fallbackSession !== activeSessionId) onSelectSession(fallbackSession)
    }
  }
  const activeSpeechMessages = useMemo(
    () =>
      messages
        .slice(Math.max(lastUserMessageIndex + 1, 0))
        .filter((message) => message.role === "assistant"),
    [lastUserMessageIndex, messages],
  )
  const activeSpeechSegments = useMemo(
    () => activeSpeechMessages.flatMap(messageSpeechSegments),
    [activeSpeechMessages],
  )
  const speech = useTTSSpeech({
    sessionId: activeSessionId,
    mode: petSettings.ttsMode,
    isThinking,
    segments: speechSegments,
    activeSegments: activeSpeechSegments,
    messageRevisions: activeSpeechMessages.map((message) => ({
      messageId: message.id,
      epoch: message.speechEpoch ?? 0,
      reason: message.speechResetReason,
    })),
  })
  const latestStreamingAssistantIndex = messages.reduce(
    (latestIndex, message, index) => (message.role === "assistant" && message.isStreaming ? index : latestIndex),
    -1,
  )
  const renderedMessages = messages.slice(visibleMessageStart, visibleMessageEnd)
  const runReviewsByMessageIndex = useMemo(() => buildRunReviewIndex(renderedMessages), [renderedMessages])
  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void getDesktopPetSettings().then((settings) => {
      if (!disposed) setPetSettings(settings)
    })
    void listenDesktopPetSettings((settings) => {
      if (!disposed) setPetSettings(settings)
    }).then((cleanup) => {
      unsubscribe = cleanup
      if (disposed) cleanup?.()
    })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  return (
    <motion.div
      key="chat-with-character"
      {...fullScreenMotion}
      transition={screenTransition}
      className="fixed inset-0 z-10 flex h-[100vh] w-[100vw] overflow-hidden bg-bg font-sans text-text"
    >
      <Sidebar
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={openWorkspaceSession}
        onDelete={onDeleteSession}
        onRename={onRenameSession}
        onNewSession={onNewSession}
        onOpenParticipants={onOpenAssistantSwitcher}
        onOpenDutyAssistant={onOpenDutyAssistantSwitcher}
        onOpenSelfAwake={onOpenSelfAwake}
        onOpenMemo={onOpenMemo}
        onOpenSkills={onOpenSkills}
        onOpenConnectors={onOpenConnectors}
        onOpenSettings={onOpenSettings}
        onOpenFile={openWorkspaceFile}
        onWorkspaceChanged={() => {
          setOpenFiles([])
          setFileContents({})
          setActiveTab(activeSessionId ? `session:${activeSessionId}` : "")
        }}
      />

      <main
        className={cn(
          "relative grid h-[100vh] min-h-0 min-w-0 flex-1 overflow-hidden",
          activeFile
            ? "grid-rows-[auto_minmax(0,1fr)]"
            : openSessionIds.length || openFiles.length
              ? "grid-rows-[auto_minmax(0,1fr)_auto]"
              : "grid-rows-[minmax(0,1fr)_auto]",
        )}
      >
        {openSessionIds.length || openFiles.length ? (
          <div className="flex h-10 min-w-0 border-b border-border bg-bg">
            <div
              className="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
              role="tablist"
              aria-label="工作标签"
            >
            {openSessionIds.map((sessionId) => {
              const session = sessions.find((item) => item.id === sessionId)
              if (!session) return null
              const tabKey = `session:${sessionId}`
              const active = activeTab === tabKey
              return (
                <div
                  key={tabKey}
                  className={cn(
                    "group flex h-10 min-w-[9rem] max-w-[15rem] shrink-0 items-center border-r border-border",
                    active && "border-t-2 border-t-accent bg-card",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setActiveTab(tabKey)
                      onSelectSession(sessionId)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 text-sm text-text-muted hover:text-text"
                    title={session.title}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    <span className="truncate">{session.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => closeWorkspaceSession(sessionId)}
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted opacity-60 hover:bg-bg hover:text-text group-hover:opacity-100"
                    aria-label={`关闭会话标签 ${session.title}`}
                    title="关闭标签"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
            {openFiles.map((file) => {
              const tabKey = `file:${file.path}`
              const active = activeTab === tabKey
              return (
                <div
                  key={tabKey}
                  className={cn(
                    "group flex h-10 min-w-[9rem] max-w-[15rem] shrink-0 items-center border-r border-border",
                    active && "border-t-2 border-t-accent bg-card",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tabKey)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 text-sm text-text-muted hover:text-text"
                    title={file.path}
                  >
                    <File className="h-4 w-4 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => closeWorkspaceFile(file.path)}
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted opacity-60 hover:bg-bg hover:text-text group-hover:opacity-100"
                    aria-label={`关闭 ${file.name}`}
                    title="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
            </div>
            <div className="ml-auto flex h-10 shrink-0 items-center bg-bg px-1.5">
              <button
                type="button"
                onClick={() => onAutoScrollChange(!autoScrollEnabled)}
                disabled={Boolean(activeFile)}
                aria-pressed={autoScrollEnabled}
                aria-label={autoScrollEnabled ? "关闭新消息自动滚动" : "开启新消息自动滚动"}
                title={activeFile ? "文件标签不使用自动滚动" : autoScrollEnabled ? "新消息自动滚动：开启" : "新消息自动滚动：关闭"}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  autoScrollEnabled && !activeFile
                    ? "bg-card text-text shadow-sm"
                    : "text-text-muted hover:bg-bg hover:text-text",
                  activeFile && "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-text-muted",
                )}
              >
                {autoScrollEnabled ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : null}
        {activeFile ? (
          <section className="min-h-0 overflow-auto bg-card" aria-label={`文件 ${activeFile.name}`}>
            <div className="sticky top-0 z-10 flex h-9 items-center border-b border-border bg-card/95 px-4 font-mono text-xs text-text-muted backdrop-blur">
              {activeFile.path}
            </div>
            {fileLoadingPath === activeFile.path ? (
              <div className="p-6 text-sm text-text-muted">正在读取文件…</div>
            ) : fileError ? (
              <div className="p-6 text-sm text-red-600">{fileError}</div>
            ) : activeFileContent?.truncated ? (
              <div className="p-6 text-sm text-text-muted">文件超过 1 MB，暂不在编辑区预览。</div>
            ) : activeFileContent?.binary ? (
              <div className="p-6 text-sm text-text-muted">这是二进制文件，暂不支持文本预览。</div>
            ) : (
              <pre className="min-h-full whitespace-pre p-5 font-mono text-[13px] leading-6 text-text selection:bg-accent/20">
                {activeFileContent?.content ?? ""}
              </pre>
            )}
          </section>
        ) : (
          <>
            <div
              key={activeSessionId || "no-session"}
              ref={messagesScrollRef}
              onScroll={(event) => {
                const element = event.currentTarget
                if (windowScrollAdjustmentRef.current) return
                if (element.scrollTop <= 96) {
                  if (autoScrollEnabled) onAutoScrollChange(false)
                  if (moveConversationWindow("older")) return
                  if (activeSession?.hasMoreMessages && !activeSession.loadingOlderMessages) {
                    // Pin the current first turn before the reducer prepends the
                    // server page. Once it arrives, the effect above advances
                    // the visible window by five older turns.
                    setVisibleWindowStartID(messages[turnStarts[visibleTurnStart]]?.id)
                    pendingOlderWindowRef.current = true
                    void onLoadOlderMessages()
                  }
                  return
                }
                const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
                if (distanceFromBottom <= 96 && visibleTurnStart < latestWindowStart) {
                  moveConversationWindow("newer")
                }
              }}
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
            >
              <div className="mx-auto w-[95%] px-[1vw]">
                {connectionError ? (
                  <div className="flex h-[61vh] flex-col items-center justify-center text-center">
                    <div className="mb-[2vh] rounded-full border border-border bg-card px-[2vw] py-[1.2vh] text-[1.8vh] uppercase tracking-[0.15em] text-accent shadow-sm">
                      后端离线
                    </div>
                    <p className="max-w-[46vw] text-[2.2vh] leading-relaxed text-text-muted">
                      无法连接 MonAgent 服务：{connectionError}
                    </p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-[61vh] flex-col items-center justify-center text-center text-text-muted">
                    <div className="mb-[4vh] flex h-[13vh] w-[13vh] items-center justify-center overflow-hidden rounded-[2.6vh] border border-border bg-card text-accent shadow-sm">
                      {assistantAvatarUrl ? (
                        <img
                          src={assistantAvatarUrl}
                          alt={assistantName}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <span className="font-serif text-[5.2vh]">{assistantInitial}</span>
                      )}
                    </div>
                    <h2 className="mb-[1.4vh] font-serif text-[4.4vh] text-text">想聊点什么？</h2>
                    <p className="max-w-[48vw] text-[2.35vh] leading-[1.55] text-text-muted">
                      可以问我项目结构、代码问题，也可以让我查看截图、分析页面或协助构建工具。
                    </p>
                  </div>
                ) : (
                  <div className="min-h-full py-[4vh]">
                    {(visibleTurnStart > 0 || activeSession?.hasMoreMessages || activeSession?.loadingOlderMessages) && (
                      <div
                        className="flex h-[4.5vh] items-center justify-center text-[1.45vh] text-text-muted"
                        role="status"
                      >
                        {activeSession.loadingOlderMessages ? "正在加载更早消息…" : "向上滚动查看更早消息"}
                      </div>
                    )}
                    {renderedMessages.map((msg, messageIndex) => {
                      const absoluteMessageIndex = visibleMessageStart + messageIndex
                      const messageDirectorRun =
                        absoluteMessageIndex === lastUserMessageIndex
                          ? displayedDirectorRun
                          : msg.role === "user"
                            ? activeSession?.directorRuns?.find((run) => run.userMessageID === msg.id)
                            : undefined
                      const runReview = runReviewsByMessageIndex.get(messageIndex)
                      return (
                        <Fragment key={`${activeSessionId}:${messageRenderKey(renderedMessages, messageIndex)}`}>
                          <span
                            ref={(element) => {
                              if (element) messageAnchorRefs.current.set(msg.id, element)
                              else messageAnchorRefs.current.delete(msg.id)
                            }}
                            className="block h-0"
                            aria-hidden="true"
                          />
                          {msg.kind === "slash-command" ? (
                            <div
                              className="my-4 flex items-center gap-3 px-[8vw] text-center text-xs text-text-muted"
                              role="status"
                            >
                              <span className="h-px flex-1 bg-border" />
                              <span className="shrink-0">
                                已执行 <span className="font-mono text-text">{msg.content}</span>
                              </span>
                              <span className="h-px flex-1 bg-border" />
                            </div>
                          ) : (
                            <MessageBubble
                              message={msg}
                              groupPosition={messageGroupPosition(renderedMessages, messageIndex)}
                              allowOrganizingReply={absoluteMessageIndex === latestStreamingAssistantIndex}
                              userAvatarUrl={userAvatarUrl}
                              assistantName={assistantName}
                              assistantInitial={assistantInitial}
                              assistantAvatarUrl={assistantAvatarUrl}
                              ttsMode={petSettings.ttsMode}
                              speechClips={speech.clips}
                              activeSpeechSegmentId={speech.activeSegmentId}
                              speechPaused={speech.paused}
                              getSpeechProgress={speech.getProgress}
                              onToggleSpeech={speech.toggle}
                              onSeekSpeech={speech.seek}
                              onBeginSeekSpeech={speech.beginSeek}
                              onEndSeekSpeech={speech.endSeek}
                              onPreviewImage={(src, alt) => onPreviewImage(src, alt ?? "图片预览")}
                              subagentThreads={activeSession?.agentThreads ?? []}
                              coordinationBatches={activeSession?.coordinationBatches ?? []}
                              onFollowupSubagent={onFollowupSubagent}
                              onInspectSubagent={onGetSubagentDetails}
                              onInterruptSubagent={onInterruptSubagent}
                            />
                          )}
                          {messageDirectorRun ? (
                            <DirectorPlanCard
                              run={messageDirectorRun}
                              participants={activeSession?.participants ?? []}
                            />
                          ) : null}
                          {runReview ? <RunReviewCard review={runReview} /> : null}
                          {activeSlashCommandNotices
                            .filter((notice) => notice.afterMessageID === msg.id)
                            .map((notice) => (
                              <div
                                key={notice.id}
                                className="my-4 flex items-center gap-3 px-[8vw] text-center text-xs text-text-muted"
                                role="status"
                              >
                                <span className="h-px flex-1 bg-border" />
                                <span className="shrink-0">
                                  已执行 <span className="font-mono text-text">{notice.command}</span>
                                </span>
                                <span className="h-px flex-1 bg-border" />
                              </div>
                            ))}
                        </Fragment>
                      )
                    })}
                    {activeSlashCommandNotices
                      .filter((notice) => !notice.afterMessageID)
                      .map((notice) => (
                        <div
                          key={notice.id}
                          className="my-4 flex items-center gap-3 px-[8vw] text-center text-xs text-text-muted"
                          role="status"
                        >
                          <span className="h-px flex-1 bg-border" />
                          <span className="shrink-0">
                            已执行 <span className="font-mono text-text">{notice.command}</span>
                          </span>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                      ))}
                    {visibleTurnStart < latestWindowStart ? (
                      <div className="flex h-[4.5vh] items-center justify-center text-[1.45vh] text-text-muted">
                        向下滚动查看较新消息
                      </div>
                    ) : null}
                    <div ref={messagesEndRef} className="h-[7vh]" />
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 overflow-visible px-[3vw]">
              <div className="mx-auto w-[95%]">
                <ChatInput
                  sessionId={activeSessionId || undefined}
                  onSend={onSendMessage}
                  onNewSession={onNewSession}
                  onOpenSettings={onOpenSettings}
                  onOpenMemo={onOpenMemo}
                  onOpenSkills={onOpenSkills}
                  onOpenSelfAwake={onOpenSelfAwake}
                  disabled={taskRunning}
                  allowFollowUp={taskRunning}
                  assistantName={assistantName}
                  permissionMode={permissionMode}
                  onPermissionModeChange={onPermissionModeChange}
                  voiceInputEnabled={petSettings.voiceInputEnabled}
                  sttConfigId={participantCount === 1
                    ? activeSession?.participants?.[0]?.sttConfigID ?? assistant?.character?.stt_config_id
                    : assistant?.character?.stt_config_id}
                  halfDuplexOutputActive={taskRunning || speech.autoPlaybackPending}
                  contextTokenEstimate={contextTokenEstimate}
                  tokenBreakdown={activeSession?.tokenBreakdown}
                  onCompact={activeSessionId ? onCompact : undefined}
                  onAbort={activeSessionId ? onAbort : undefined}
                />
              </div>
            </div>
          </>
        )}
      </main>

      {activePendingPermissions.length > 0 && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
              <div className="grid max-h-[80vh] w-full max-w-2xl gap-3 overflow-y-auto">
                {activePendingPermissions.map((request) => (
                  <PermissionRequestCard
                    key={request.id}
                    request={request}
                    onReply={onPermissionReply}
                    tone="overlay"
                  />
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}

      <CharacterPanel assistant={assistant} assistantError={assistantError} activeAction={activeCharacterAction} />
    </motion.div>
  )
}
