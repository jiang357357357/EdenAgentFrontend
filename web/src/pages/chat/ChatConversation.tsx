import {useConversationWindow} from './use-conversation-window'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
import type { ChatPageProps } from './chat-page-props'
import { ChatConversationToolbar } from './ChatConversationToolbar'
import { useWorkbenchToolbarSlot } from '../../components/workbench/workbench-toolbar-slot'
import { RuntimeNotices } from "../../components/chat/RuntimeNotices"
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChatInput } from "../../components/chat/input"
import { DirectorPlanCard, MessageBubble, RunReviewCard } from "../../components/chat/message"
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
import { createContextTokenEstimator } from "../../lib/token-usage"
import { messageGroupPosition, messageRenderKey } from "../../lib/message-grouping"
import { buildReplyActionGroups } from "../../lib/reply-action-groups"
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

const EMPTY_THREADS: NonNullable<Session["agentThreads"]> = []
const EMPTY_BATCHES: NonNullable<Session["coordinationBatches"]> = []
const IGNORE_HISTORY_BROWSING = () => {}

export function ChatConversation({
  sessions,
  activeSessionId,
  activeSession,
  currentUser,
  assistant,
  assistantError,
  activeCharacterAction,
  isThinking,
  connectionFeedback,
  onDismissConnectionFeedback,
  onRetryConnectionSync,
  runtimeError,
  activePendingPermissions,
  messagesScrollRef,
  messagesEndRef,
  autoScrollReady = true,
  autoScrollEnabled,
  onAutoScrollChange,
  backgroundPreference,
  backgroundImageUrl,
  backgroundReady,
  backgroundUploading,
  backgroundSaving,
  appearanceSettingError,
  onBackgroundChange,
  onBackgroundImageSelect,
  appearancePreference,
  appearanceReady,
  appearanceSaving,
  onAppearanceChange,
  onLoadOlderMessages,
  onHistoryBrowsingChange = IGNORE_HISTORY_BROWSING,
  onSelectSession,
  onDeleteSession,
  onDeleteMessage,
  onReadReplyText,
  onRenameSession,
  onArchiveSession,
  onPinSession,
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
  onOpenDutyAssistantSwitcher,
  onOpenSessionAssistantSwitcher,
  onOpenSettings,
  onOpenPlugins,
  applicationPage,
  onOpenSelfAwake,
  onOpenAllSessions,
  onOpenMemo,
  onOpenSkills,
  onOpenConnectors,
  onOpenConfiguration,
  onOpenSharedWorkspace,
  sidebarActivity,
  onSidebarActivityChange,
  focused = true,
}: ChatPageProps) {
  const toolbarTarget = useWorkbenchToolbarSlot()
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
  const assistantName = assistant?.name || assistant?.character?.name || "助手"
  const assistantInitial = assistantName.trim().slice(0, 1) || "助"
  const assistantAvatarUrl = resolveCoreAssetUrl(assistant?.character?.avatar_url)
  const userAvatarUrl = resolveCoreAssetUrl(currentUser?.avatar_url)
  const messages = activeSession?.messages ?? []
  const {turnStarts,visibleWindowStartID,setVisibleWindowStartID,pendingOlderWindowRef,messageAnchorRefs,windowScrollAdjustmentRef,latestWindowStart,visibleTurnStart,visibleTurnEnd,visibleMessageStart,visibleMessageEnd,moveConversationWindow}=useConversationWindow({messages,activeSessionId,messagesScrollRef,onHistoryBrowsingChange})

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
    window.addEventListener("edenagent:slash-command-executed", handleSlashCommand)
    return () => window.removeEventListener("edenagent:slash-command-executed", handleSlashCommand)
  }, [activeSessionId, messages])

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
  const estimateContextTokens = useMemo(() => createContextTokenEstimator(), [])
  const contextTokenEstimate = useMemo(
    () => estimateContextTokens(messages, activeSession?.contextTokens),
    [messages, activeSession?.contextTokens, estimateContextTokens],
  )
  const localTTSConfigId = getStoredRuntimeOrigin() === "local" ? 0 : undefined
  const localSTTConfigId = getStoredRuntimeOrigin() === "local" ? 0 : undefined
  const soloTTSConfigId =
    participantCount === 1 ? (activeSession?.participants?.[0]?.ttsConfigID ?? localTTSConfigId) : undefined
  const messageSpeechSegments = useCallback((message?: MessageData): SpeechSegment[] => {
    if (!message) return []
    const participant = message.speaker
      ? activeSession?.participants?.find((item) => String(item.assistantID) === String(message.speaker?.assistantID))
      : participantCount === 1 ? activeSession?.participants?.[0] : undefined
    const configId = participant ? participant.ttsConfigID ?? localTTSConfigId : message.speaker?.ttsConfigID ?? soloTTSConfigId
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
                configId,
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
        configId,
      },
    ]
  }, [activeSession?.participants, participantCount, localTTSConfigId, soloTTSConfigId])
  const speechSegments = useMemo(
    () => messages.filter((message) => message.role === "assistant").flatMap(messageSpeechSegments),
    [messages, messageSpeechSegments],
  )
  const activeSpeechMessages = useMemo(
    () => messages.slice(Math.max(lastUserMessageIndex + 1, 0)).filter((message) => message.role === "assistant"),
    [lastUserMessageIndex, messages],
  )
  const activeSpeechSegments = useMemo(
    () => activeSpeechMessages.flatMap(messageSpeechSegments),
    [activeSpeechMessages, messageSpeechSegments],
  )
  const speech = useTTSSpeech({
    audioOutputDeviceId: petSettings.audioOutputDeviceId,
    sessionId: activeSessionId,
    mode: focused ? petSettings.ttsMode : 'none',
    isThinking,
    segments: speechSegments,
    activeSegments: activeSpeechSegments,
    messageRevisions: activeSpeechMessages.map((message) => ({
      messageId: message.id,
      epoch: message.speechEpoch ?? 0,
      reason: message.speechResetReason,
    })),
    speechRate: petSettings.speechRate,
    speechVolume: petSettings.speechVolume,
  })
  const latestStreamingAssistantIndex = messages.reduce(
    (latestIndex, message, index) => (message.role === "assistant" && message.isStreaming ? index : latestIndex),
    -1,
  )
  const renderedMessages = useMemo(
    () => messages.slice(visibleMessageStart, visibleMessageEnd),
    [messages, visibleMessageStart, visibleMessageEnd],
  )
  const runReviewsByMessageIndex = useMemo(() => buildRunReviewIndex(renderedMessages), [renderedMessages])
  const replyActionGroups = useMemo(() => buildReplyActionGroups(renderedMessages,
    isThinking && visibleMessageEnd === messages.length,
    visibleMessageStart === 0 && Boolean(activeSession?.hasMoreMessages)),
    [renderedMessages, isThinking, visibleMessageEnd, messages.length, visibleMessageStart, activeSession?.hasMoreMessages])
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
      <main
        aria-label="聊天工作区"
        className={`chat-main relative grid h-full min-h-0 min-w-0 flex-1 ${toolbarTarget ? 'grid-rows-[auto_minmax(0,1fr)_auto]' : 'grid-rows-[auto_auto_minmax(0,1fr)_auto]'} overflow-hidden`}
        style={{ backgroundColor: "var(--interface-panel-background)" }}
      >
        <ChatConversationToolbar {...{activeSessionId,sessions,activeSession,assistant,assistantName,backgroundPreference,backgroundReady,backgroundUploading,backgroundSaving,appearanceSaving,appearanceSettingError,appearancePreference,appearanceReady,onBackgroundChange,onAppearanceChange,onBackgroundImageSelect,onAutoScrollChange,autoScrollEnabled,autoScrollReady}} />
        {(          <>
            <div className="mx-auto max-h-[35vh] w-[95%] shrink-0 overflow-y-auto px-[1cqw]">
              <RuntimeNotices connection={connectionFeedback} runtimeError={runtimeError}
                modelRetry={activeSession?.modelRetry} onDismissConnection={onDismissConnectionFeedback}
                onRetrySync={onRetryConnectionSync} onSelectAssistant={activeSessionId ? onOpenSessionAssistantSwitcher : undefined} />
            </div>
            <div
              key={activeSessionId || "no-session"}
              ref={messagesScrollRef}
              onScroll={(event) => {
                const element = event.currentTarget
                if (windowScrollAdjustmentRef.current) return
                if (element.scrollTop <= 96) {
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
              <div className="mx-auto w-[95%] px-[1cqw]">
                {messages.length === 0 && activeSession?.historyReady === false ? (
                  <div role="status" className="flex h-[61vh] items-center justify-center text-sm text-text-muted">
                    {runtimeError ? "会话历史暂未加载，请重试连接。" : "正在读取会话历史…"}
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
                    <p className="max-w-[90%] text-[2.35vh] leading-[1.55] text-text-muted">
                      可以问我项目结构、代码问题，也可以让我查看截图、分析页面或协助构建工具。
                    </p>
                  </div>
                ) : (
                  <div className="min-h-full py-[4vh]">
                    {(visibleTurnStart > 0 ||
                      activeSession?.hasMoreMessages ||
                      activeSession?.loadingOlderMessages) && (
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
                              className="my-4 flex items-center gap-3 px-[4cqw] text-center text-xs text-text-muted"
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
                              onDeleteMessage={() => onDeleteMessage(activeSessionId, msg.id)}
                              onReadReplyText={msg.id.startsWith("compaction:") ? undefined : () => onReadReplyText(activeSessionId, msg.id)}
                              replyGroup={replyActionGroups.get(msg.id)}
                              deleteDisabled={isThinking}
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
                              subagentThreads={activeSession?.agentThreads ?? EMPTY_THREADS}
                              coordinationBatches={activeSession?.coordinationBatches ?? EMPTY_BATCHES}
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
                                className="my-4 flex items-center gap-3 px-[4cqw] text-center text-xs text-text-muted"
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
                          className="my-4 flex items-center gap-3 px-[4cqw] text-center text-xs text-text-muted"
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

            <div className="shrink-0 overflow-visible px-[3cqw]">
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
                  voiceInputEnabled={focused && petSettings.voiceInputEnabled}
                  audioInputDeviceId={petSettings.audioInputDeviceId}
                  sttConfigId={
                    participantCount === 1
                      ? (activeSession?.participants?.[0]?.sttConfigID ??
                        assistant?.character?.stt_config_id ??
                        localSTTConfigId)
                      : (assistant?.character?.stt_config_id ?? localSTTConfigId)
                  }
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
  )
}
