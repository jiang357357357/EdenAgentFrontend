import { Lock, Menu, MessageSquare, NotebookPen, Plus, Sparkles, Unlock, Users } from "lucide-react"
import { motion } from "motion/react"
import { Fragment, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { CharacterPanel } from "../../components/character"
import { ChatInput } from "../../components/chat/input"
import { DirectorPlanCard, MessageBubble } from "../../components/chat/message"
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
import {
  messageGroupPosition,
  messageRenderKey,
} from "../../lib/message-grouping"
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

interface ChatPageProps {
  sessions: Session[]
  activeSessionId: string
  activeSession?: Session
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
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
  onOpenSessionAssistantSwitcher: () => void
  onOpenSettings: () => void
  onOpenSelfAwake: () => void
  onOpenMemo: () => void
  onOpenSkills: () => void
}

export function ChatPage({
  sessions,
  activeSessionId,
  activeSession,
  sidebarOpen,
  setSidebarOpen,
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
  onLogout,
  onOpenAssistantSwitcher,
  onOpenSessionAssistantSwitcher,
  onOpenSettings,
  onOpenSelfAwake,
  onOpenMemo,
  onOpenSkills,
}: ChatPageProps) {
  const [slashCommandNotices, setSlashCommandNotices] = useState<Array<{ id: number; sessionID?: string; command: string; afterMessageID?: string }>>([])
  const taskRunning = Boolean(
    isThinking
    || activeSession?.coordinationBatches?.some((batch) => ["collecting", "ready", "aggregating"].includes(batch.status))
    || activeSession?.agentThreads?.some((thread) => ["created", "queued", "running", "waiting"].includes(thread.status)),
  )
  const [petSettings, setPetSettings] = useState<PetSettings>(DEFAULT_PET_SETTINGS)
  const assistantName = assistant?.name || assistant?.character?.name || "助手"
  const assistantInitial = assistantName.trim().slice(0, 1) || "助"
  const assistantAvatarUrl = resolveCoreAssetUrl(assistant?.character?.avatar_url)
  const userAvatarUrl = resolveCoreAssetUrl(currentUser?.avatar_url)
  const messages = activeSession?.messages ?? []
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

  const activeSlashCommandNotices = slashCommandNotices.filter((item) => item.sessionID === activeSessionId)
  const participantCount = activeSession?.participants?.length ?? 0
  const lastUserMessageIndex = messages.reduce(
    (lastIndex, message, index) => (message.role === "user" ? index : lastIndex),
    -1,
  )
  const lastUserMessageID = messages[lastUserMessageIndex]?.id
  const displayedDirectorRun = useMemo(
    () => {
      if (participantCount <= 1) return undefined
      const persisted = activeSession?.directorRun
      if (persisted && (!persisted.userMessageID || persisted.userMessageID === lastUserMessageID)) {
        return persisted
      }
      return isThinking ? startCompanionDirectorRun(participantCount, lastUserMessageID) : undefined
    },
    [activeSession?.directorRun, isThinking, lastUserMessageID, participantCount],
  )
  const visibleTokenEstimate = useMemo(() => estimateConversationTokens(messages), [messages])
  const contextTokenEstimate = activeSession?.contextTokens ?? visibleTokenEstimate
  const messageSpeechSegments = (message?: MessageData): SpeechSegment[] => {
    if (!message) return []
    if (message.segments?.length) {
      return message.segments.flatMap((segment) => {
        if (segment.type !== "text") return []
        return segment.content.trim()
          ? [{
              id: segment.id,
              messageId: message.id,
              text: segment.content,
              state: segment.state,
              configId: message.speaker?.ttsConfigID,
            }]
          : []
      })
    }
    if (!message.content) return []
    return [{
      id: `${message.id}:content`,
      messageId: message.id,
      text: message.content,
      state: message.isStreaming ? "streaming" : "done",
      configId: message.speaker?.ttsConfigID,
    }]
  }
  const speechSegments = useMemo(
    () => messages.filter((message) => message.role === "assistant").flatMap(messageSpeechSegments),
    [messages],
  )
  const activeSpeechSegments = useMemo(
    () => messages
      .slice(Math.max(lastUserMessageIndex + 1, 0))
      .filter((message) => message.role === "assistant")
      .flatMap(messageSpeechSegments),
    [lastUserMessageIndex, messages],
  )
  const speech = useTTSSpeech({
    sessionId: activeSessionId,
    mode: petSettings.ttsMode,
    isThinking,
    segments: speechSegments,
    activeSegments: activeSpeechSegments,
  })
  const latestStreamingAssistantIndex = messages.reduce(
    (latestIndex, message, index) =>
      message.role === "assistant" && message.isStreaming ? index : latestIndex,
    -1,
  )
  const renderedMessages = messages
  const toggleAutoScroll = () => {
    onAutoScrollChange(!autoScrollEnabled)
  }

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
        onSelect={(id) => {
          onSelectSession(id)
          setSidebarOpen(false)
        }}
        onDelete={onDeleteSession}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <main
        className={cn(
          "relative grid h-[100vh] min-h-0 min-w-0 flex-1 overflow-hidden",
          activePendingPermissions.length > 0
            ? "grid-rows-[12.5vh_minmax(0,1fr)_44vh]"
            : "grid-rows-[12.5vh_minmax(0,1fr)_20vh]",
        )}
      >
        <header className="z-10 flex h-full min-h-0 items-center justify-between border-b border-border bg-bg/80 px-[3.2vw] backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-[1.6vw] font-serif text-[3.1vh] text-text">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-[1vh] p-[1.4vh] text-text-muted transition-colors hover:bg-card hover:text-text"
              aria-label="打开会话抽屉"
            >
              <Menu className="h-[3.2vh] w-[3.2vh]" />
            </button>
            <MessageSquare className="h-[2.7vh] w-[2.7vh] text-accent" />
            <span className="truncate">{activeSession?.title || "新会话"}</span>
          </div>
          <div className="flex items-center gap-[1vw]">
            <button
              type="button"
              onClick={onOpenSessionAssistantSwitcher}
              className="group relative flex h-[5.4vh] w-[5.4vh] items-center justify-center outline-none"
              aria-label={`切换本会话助手，当前：${assistantName}`}
            >
              <span className="flex h-[3.7vh] w-[3.7vh] items-center justify-center overflow-hidden rounded-full border border-border bg-card font-serif text-[1.35vh] text-accent shadow-sm">
                {assistantAvatarUrl ? (
                  <img src={assistantAvatarUrl} alt={assistantName} className="h-full w-full object-cover object-top" draggable={false} />
                ) : (
                  assistantInitial
                )}
              </span>
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.7vh)] z-30 -translate-x-1/2 whitespace-nowrap rounded-[0.55vh] border border-border bg-card/96 px-[0.7vw] py-[0.45vh] text-[1.35vh] tracking-normal text-text opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                当前助手 · {assistantName}
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenAssistantSwitcher}
              className="group relative flex h-[5.4vh] w-[5.4vh] items-center justify-center text-text-muted outline-none transition-colors hover:text-accent focus-visible:text-accent"
              aria-label={`管理会话参与者，当前 ${activeSession?.participants?.length ?? 0} 位`}
            >
              <Users className="h-[2.45vh] w-[2.45vh]" />
              <span className="pointer-events-none absolute right-0 top-[calc(100%+0.7vh)] z-30 w-[16vw] min-w-[220px] rounded-[0.8vh] border border-border bg-card/98 p-[1.1vh] text-left tracking-normal text-text opacity-0 shadow-lg backdrop-blur-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <span className="flex items-center justify-between border-b border-border/70 px-[0.35vw] pb-[0.8vh]">
                  <span className="text-[1.48vh] font-medium">在场助手</span>
                  <span className="text-[1.25vh] text-text-muted">{activeSession?.participants?.length ?? 0} 位</span>
                </span>
                <span className="mt-[0.55vh] flex flex-col">
                  {activeSession?.participants?.length ? activeSession?.participants.map((participant) => {
                    const avatar = resolveCoreAssetUrl(participant.avatarUrl)
                    const name = participant.assistantName || participant.characterName || "助手"
                    return (
                      <span key={String(participant.assistantID)} className="flex items-center gap-[0.65vw] rounded-[0.55vh] px-[0.35vw] py-[0.55vh]">
                        <span className="flex h-[3.1vh] w-[3.1vh] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-bg font-serif text-[1.2vh] text-accent">
                          {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover object-top" /> : name.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[1.42vh] font-medium">{name}</span>
                          {participant.signature ? (
                            <span className="mt-[0.1vh] block truncate text-[1.18vh] text-text-muted">{participant.signature}</span>
                          ) : null}
                        </span>
                      </span>
                    )
                  }) : (
                    <span className="px-[0.35vw] py-[1vh] text-[1.3vh] text-text-muted">尚未选择会话参与者</span>
                  )}
                </span>
                <span className="mt-[0.45vh] block border-t border-border/70 px-[0.35vw] pt-[0.7vh] text-[1.18vh] text-text-muted">
                  点击管理参与者
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenSelfAwake}
              className="group relative flex h-[5.4vh] w-[5.4vh] items-center justify-center text-text-muted outline-none transition-colors hover:text-accent focus-visible:text-accent"
              aria-label="打开自醒"
            >
              <Sparkles className="h-[2.45vh] w-[2.45vh]" />
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.7vh)] z-30 -translate-x-1/2 whitespace-nowrap rounded-[0.55vh] border border-border bg-card/96 px-[0.7vw] py-[0.45vh] text-[1.35vh] tracking-normal text-text opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                自醒
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenMemo}
              className="group relative flex h-[5.4vh] w-[5.4vh] items-center justify-center text-text-muted outline-none transition-colors hover:text-accent focus-visible:text-accent"
              aria-label="打开备忘录"
            >
              <NotebookPen className="h-[2.45vh] w-[2.45vh]" />
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.7vh)] z-30 -translate-x-1/2 whitespace-nowrap rounded-[0.55vh] border border-border bg-card/96 px-[0.7vw] py-[0.45vh] text-[1.35vh] tracking-normal text-text opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                备忘录
              </span>
            </button>
            <button
              type="button"
              onClick={toggleAutoScroll}
              className={cn(
                "group relative flex h-[5.4vh] w-[5.4vh] items-center justify-center outline-none transition-colors",
                autoScrollEnabled
                  ? "text-accent"
                  : "text-text-muted hover:text-accent focus-visible:text-accent",
              )}
              aria-label={autoScrollEnabled ? "关闭自动滚动" : "开启自动滚动"}
            >
              {autoScrollEnabled ? <Lock className="h-[2.45vh] w-[2.45vh]" /> : <Unlock className="h-[2.45vh] w-[2.45vh]" />}
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.7vh)] z-30 -translate-x-1/2 whitespace-nowrap rounded-[0.55vh] border border-border bg-card/96 px-[0.7vw] py-[0.45vh] text-[1.35vh] tracking-normal text-text opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {autoScrollEnabled ? "自动滚动" : "自动滚动已关闭"}
              </span>
            </button>
            <button
              type="button"
              onClick={onNewSession}
              className="group relative flex h-[5.4vh] w-[5.4vh] items-center justify-center rounded-[1vh] text-accent outline-none transition-colors hover:bg-card focus-visible:bg-card"
              aria-label="新会话"
            >
              <Plus className="h-[2.65vh] w-[2.65vh]" />
              <span className="pointer-events-none absolute right-0 top-[calc(100%+0.7vh)] z-30 whitespace-nowrap rounded-[0.55vh] border border-border bg-card/96 px-[0.7vw] py-[0.45vh] text-[1.35vh] tracking-normal text-text opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                新会话
              </span>
            </button>
          </div>
        </header>

        <div
          key={activeSessionId || "no-session"}
          ref={messagesScrollRef}
          onScroll={(event) => {
            if (event.currentTarget.scrollTop <= 96 && activeSession?.hasMoreMessages && !activeSession.loadingOlderMessages) {
              void onLoadOlderMessages()
            }
          }}
          className="min-h-0 flex-1 overflow-y-auto scroll-smooth"
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
                {(activeSession?.hasMoreMessages || activeSession?.loadingOlderMessages) && (
                  <div className="flex h-[4.5vh] items-center justify-center text-[1.45vh] text-text-muted" role="status">
                    {activeSession.loadingOlderMessages ? "正在加载更早消息…" : "向上滚动加载更早消息"}
                  </div>
                )}
                {renderedMessages.map((msg, messageIndex) => {
                  const messageDirectorRun =
                    messageIndex === lastUserMessageIndex
                      ? displayedDirectorRun
                      : msg.role === "user"
                        ? activeSession?.directorRuns?.find((run) => run.userMessageID === msg.id)
                        : undefined
                  return (
                  <Fragment key={`${activeSessionId}:${messageRenderKey(renderedMessages, messageIndex)}`}>
                    {msg.kind === "slash-command" ? (
                      <div className="my-4 flex items-center gap-3 px-[8vw] text-center text-xs text-text-muted" role="status">
                        <span className="h-px flex-1 bg-border" />
                        <span className="shrink-0">已执行 <span className="font-mono text-text">{msg.content}</span></span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    ) : (
                    <MessageBubble
                      message={msg}
                      groupPosition={messageGroupPosition(renderedMessages, messageIndex)}
                      allowOrganizingReply={messageIndex === latestStreamingAssistantIndex}
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
                    {activeSlashCommandNotices.filter((notice) => notice.afterMessageID === msg.id).map((notice) => (
                      <div key={notice.id} className="my-4 flex items-center gap-3 px-[8vw] text-center text-xs text-text-muted" role="status">
                        <span className="h-px flex-1 bg-border" />
                        <span className="shrink-0">已执行 <span className="font-mono text-text">{notice.command}</span></span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    ))}
                  </Fragment>
                  )
                })}
                {activeSlashCommandNotices.filter((notice) => !notice.afterMessageID).map((notice) => (
                  <div key={notice.id} className="my-4 flex items-center gap-3 px-[8vw] text-center text-xs text-text-muted" role="status">
                    <span className="h-px flex-1 bg-border" />
                    <span className="shrink-0">已执行 <span className="font-mono text-text">{notice.command}</span></span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                ))}
                <div ref={messagesEndRef} className="h-[7vh]" />
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 overflow-visible px-[3vw]">
          <div className="mx-auto w-[95%]">
            <ChatInput
              onSend={onSendMessage}
              onNewSession={onNewSession}
              onOpenSettings={onOpenSettings}
              onOpenMemo={onOpenMemo}
              onOpenSkills={onOpenSkills}
              onOpenSelfAwake={onOpenSelfAwake}
              disabled={taskRunning}
              assistantName={assistantName}
              permissionMode={permissionMode}
              onPermissionModeChange={onPermissionModeChange}
              voiceInputEnabled={petSettings.voiceInputEnabled}
              sttConfigId={assistant?.character?.stt_config_id}
              halfDuplexOutputActive={taskRunning || speech.autoPlaybackPending}
              contextTokenEstimate={contextTokenEstimate}
              onCompact={activeSessionId ? onCompact : undefined}
              onAbort={activeSessionId ? onAbort : undefined}
            />
          </div>
        </div>
      </main>

      {activePendingPermissions.length > 0 && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
              <div className="grid max-h-[80vh] w-full max-w-2xl gap-3 overflow-y-auto">
                {activePendingPermissions.map((request) => (
                  <PermissionRequestCard key={request.id} request={request} onReply={onPermissionReply} tone="overlay" />
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
