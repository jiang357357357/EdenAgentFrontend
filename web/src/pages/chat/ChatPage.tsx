import { Lock, Menu, MessageSquare, NotebookPen, Sparkles, Unlock } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { CharacterPanel } from "../../components/CharacterPanel"
import { ChatInput } from "../../components/ChatInput"
import { MessageBubble } from "../../components/MessageBubble"
import { PermissionRequestCard } from "../../components/PermissionRequestCard"
import { Sidebar } from "../../components/Sidebar"
import { resolveCoreAssetUrl, type ActiveCharacterAction, type AuthUser, type CoreAssistant } from "../../lib/auth"
import {
  DEFAULT_PET_SETTINGS,
  getDesktopPetSettings,
  listenDesktopPetSettings,
  type PetSettings,
} from "../../lib/desktop-window"
import { useTTSSpeech } from "../../hooks/useTTSSpeech"
import { cn } from "../../lib/utils"
import type { PendingPermission, PermissionMode, PromptAttachment, Session } from "../../types"

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
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onSendMessage: (content: string, attachments: PromptAttachment[]) => Promise<void>
  onPermissionReply: (requestID: string, reply: "once" | "always" | "reject", message?: string) => Promise<void>
  permissionMode: PermissionMode
  onPermissionModeChange: (mode: PermissionMode) => Promise<void>
  onPreviewImage: (src: string, alt?: string) => void
  onLogout: () => Promise<void> | void
  onOpenSelfAwake: () => void
  onOpenMemo: () => void
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
  onSelectSession,
  onNewSession,
  onSendMessage,
  onPermissionReply,
  permissionMode,
  onPermissionModeChange,
  onPreviewImage,
  onLogout,
  onOpenSelfAwake,
  onOpenMemo,
}: ChatPageProps) {
  const [petSettings, setPetSettings] = useState<PetSettings>(DEFAULT_PET_SETTINGS)
  const assistantName = assistant?.name || assistant?.character?.name || "助手"
  const assistantInitial = assistantName.trim().slice(0, 1) || "助"
  const assistantAvatarUrl = resolveCoreAssetUrl(assistant?.character?.avatar_url)
  const userAvatarUrl = resolveCoreAssetUrl(currentUser?.avatar_url)
  const messages = activeSession?.messages ?? []
  const lastUserMessageIndex = messages.reduce(
    (lastIndex, message, index) => (message.role === "user" ? index : lastIndex),
    -1,
  )
  const activeReplyMessage = messages
    .slice(Math.max(lastUserMessageIndex + 1, 0))
    .reverse()
    .find((message) => message.role === "assistant")
  const speechSegments = useMemo(() => {
    if (!activeReplyMessage) return []
    if (activeReplyMessage.segments?.length) {
      return activeReplyMessage.segments.flatMap((segment) => {
        if (segment.type !== "text" || segment.state === "streaming") return []
        return segment.content.trim()
          ? [{ id: segment.id, messageId: activeReplyMessage.id, text: segment.content }]
          : []
      })
    }
    if (!activeReplyMessage.content || activeReplyMessage.isStreaming) return []
    return [{ id: `${activeReplyMessage.id}:content`, messageId: activeReplyMessage.id, text: activeReplyMessage.content }]
  }, [activeReplyMessage])
  const speech = useTTSSpeech({
    configId: assistant?.character?.tts_config_id,
    sessionId: activeSessionId,
    mode: petSettings.ttsMode,
    isThinking,
    segments: speechSegments,
  })
  const hasStreamingAssistantMessage = messages.some(
    (message) => message.role === "assistant" && Boolean(message.isStreaming),
  )
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
        onNew={onNewSession}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <main
        className={cn(
          "relative grid h-[100vh] min-h-0 w-[66vw] flex-none overflow-hidden",
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
          </div>
        </header>

        <div
          key={activeSessionId || "no-session"}
          ref={messagesScrollRef}
          className="min-h-0 flex-1 overflow-y-auto scroll-smooth"
        >
          <div className="mx-auto w-[calc(100%_-_5vw)] max-w-[52vw] px-[1vw]">
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
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    userAvatarUrl={userAvatarUrl}
                    assistantName={assistantName}
                    assistantInitial={assistantInitial}
                    assistantAvatarUrl={assistantAvatarUrl}
                    onTextReveal={() => {
                      if (autoScrollEnabled) messagesEndRef.current?.scrollIntoView({ block: "end" })
                    }}
                    ttsMode={petSettings.ttsMode}
                    speechClips={speech.clips}
                    activeSpeechSegmentId={speech.activeSegmentId}
                    speechPaused={speech.paused}
                    onToggleSpeech={speech.toggle}
                    onPreviewImage={(src, alt) => onPreviewImage(src, alt ?? "图片预览")}
                  />
                ))}
                {isThinking && !hasStreamingAssistantMessage && (
                  <div className="flex w-full gap-[1.7vw] px-[1vw] py-[4vh] opacity-70 md:px-0">
                    <div className="flex h-[5.9vh] w-[5.9vh] flex-shrink-0 items-center justify-center overflow-hidden rounded-[1vh] border border-accent bg-card text-[2vh] text-accent">
                      {assistantAvatarUrl ? (
                        <img
                          src={assistantAvatarUrl}
                          alt={assistantName}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        assistantInitial
                      )}
                    </div>
                    <div className="flex items-center">
                      <span className="animate-pulse font-serif text-[2.2vh] text-text-muted">
                        {assistant?.name || assistant?.character?.name || "助手"}正在思考...
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} className="h-[7vh]" />
              </div>
            )}
          </div>
        </div>

        <div className="h-full min-h-0 overflow-visible px-[3vw]">
          <div className="mx-auto w-[calc(100%_-_5vw)] max-w-[52vw]">
            {activePendingPermissions.length > 0 && (
              <div className="mb-2 grid max-h-[24vh] gap-2 overflow-y-auto">
                {activePendingPermissions.map((request) => (
                  <PermissionRequestCard key={request.id} request={request} onReply={onPermissionReply} />
                ))}
              </div>
            )}
            <ChatInput
              onSend={onSendMessage}
              disabled={isThinking}
              assistantName={assistantName}
              permissionMode={permissionMode}
              onPermissionModeChange={onPermissionModeChange}
              voiceInputEnabled={petSettings.voiceInputEnabled}
              sttConfigId={assistant?.character?.stt_config_id}
            />
          </div>
        </div>
      </main>

      <CharacterPanel assistant={assistant} assistantError={assistantError} activeAction={activeCharacterAction} />
    </motion.div>
  )
}
