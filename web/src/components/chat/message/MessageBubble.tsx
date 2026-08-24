import type { CoordinationBatch, MessageData, SubagentThread, SubagentThreadDetails } from "../../../types"
import { ToolCard } from "./ToolCard"
import { ThinkingBlock } from "./ThinkingBlock"
import { MetaPartCard } from "./MetaPartCard"
import { cn } from "../../../lib/utils"
import { resolveEdenAgentUrl } from "../../../lib/agent-client"
import { resolveCoreAssetUrl } from "../../../lib/auth"
import { User } from "lucide-react"
import type { SpeechClip, SpeechProgress } from "../../../hooks/useTTSSpeech"
import type { PetTTSMode } from "../../../lib/desktop-window"
import { shouldShowOrganizingReply, type MessageGroupPosition } from "../../../lib/message-grouping"
import { MessageErrorCard, RawOutput } from "./MessageDetails"
import { TextSegment } from "./TextSegment"

interface MessageBubbleProps {
  message: MessageData
  userAvatarUrl?: string
  assistantName?: string
  assistantInitial?: string
  assistantAvatarUrl?: string
  onPreviewImage?: (src: string, alt?: string) => void
  onTextReveal?: () => void
  ttsMode?: PetTTSMode
  speechClips?: Record<string, SpeechClip>
  activeSpeechSegmentId?: string | null
  speechPaused?: boolean
  getSpeechProgress?: (segmentId: string) => SpeechProgress | null
  onToggleSpeech?: (segmentId: string, text: string, messageId: string) => void
  onSeekSpeech?: (segmentId: string, time: number) => void
  onBeginSeekSpeech?: (segmentId: string) => void
  onEndSeekSpeech?: (segmentId: string) => void
  groupPosition?: MessageGroupPosition
  allowOrganizingReply?: boolean
  subagentThreads?: SubagentThread[]
  coordinationBatches?: CoordinationBatch[]
  onFollowupSubagent?: (target: string, message: string) => Promise<unknown>
  onInspectSubagent?: (target: string) => Promise<SubagentThreadDetails>
  onInterruptSubagent?: (target: string) => Promise<unknown>
}

export function MessageBubble({
  message,
  userAvatarUrl,
  assistantName = "助手",
  assistantInitial = "助",
  assistantAvatarUrl,
  onPreviewImage,
  onTextReveal,
  ttsMode = "none",
  speechClips = {},
  activeSpeechSegmentId,
  speechPaused = false,
  getSpeechProgress,
  onToggleSpeech,
  onSeekSpeech,
  onBeginSeekSpeech,
  onEndSeekSpeech,
  groupPosition = "single",
  allowOrganizingReply = true,
  subagentThreads,
  coordinationBatches,
  onFollowupSubagent,
  onInspectSubagent,
  onInterruptSubagent,
}: MessageBubbleProps) {
  const isUser = message.role === "user"
  const messageAssistantName = message.speaker?.assistantName || message.speaker?.characterName || assistantName
  const messageAssistantInitial = messageAssistantName.trim().slice(0, 1) || assistantInitial
  const messageAssistantAvatarUrl = message.speaker?.avatarUrl
    ? resolveCoreAssetUrl(message.speaker.avatarUrl)
    : assistantAvatarUrl
  const orderedSegments = message.segments && message.segments.length > 0 ? message.segments : undefined
  const useOrderedAssistantSegments = !isUser && Boolean(orderedSegments)
  const renderedContent = message.content
  const showsMessageHeader = groupPosition === "single" || groupPosition === "first"

  return (
    <div
      className={cn(
        "group flex w-full gap-[2.4vh] px-[1.6vh] md:px-0",
        groupPosition === "single" && "py-[2.5vh]",
        groupPosition === "first" && "pb-[0.35vh] pt-[2.5vh]",
        groupPosition === "middle" && "py-[0.35vh]",
        groupPosition === "last" && "pb-[2.5vh] pt-[0.35vh]",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      {showsMessageHeader ? (
        <div
          className={cn(
            "flex h-[5.8vh] w-[5.8vh] flex-shrink-0 items-center justify-center overflow-hidden rounded-[1.05vh] text-[2.2vh]",
            isUser ? "bg-card border border-accent text-accent" : "bg-card border border-border text-text font-serif",
          )}
        >
          {isUser && userAvatarUrl ? (
            <img src={userAvatarUrl} alt="用户头像" className="h-full w-full object-cover" draggable={false} />
          ) : isUser ? (
            <User className="h-[2.9vh] w-[2.9vh]" />
          ) : messageAssistantAvatarUrl ? (
            <img src={messageAssistantAvatarUrl} alt={messageAssistantName} className="h-full w-full object-cover" draggable={false} />
          ) : (
            messageAssistantInitial
          )}
        </div>
      ) : (
        <div className="h-[5.8vh] w-[5.8vh] flex-shrink-0" aria-hidden="true" />
      )}

      {/* Message Content Container */}
      <div className={cn("flex w-full max-w-[90%] min-w-0 flex-col gap-[0.35vh]", isUser ? "items-end" : "items-start")}>
        {showsMessageHeader ? (
          <div className="flex items-center gap-[0.8vh] px-[0.45vh]">
            <span className="text-[1.85vh] font-medium uppercase tracking-[0.05em] text-text-muted">
              {isUser ? "你" : messageAssistantName}
            </span>
            <span className="text-[1.45vh] text-text-muted/50">{message.timestamp}</span>
            {!isUser && message.completionState === "provisional" ? (
              <span className="rounded-full bg-amber-100 px-[0.55vh] py-[0.1vh] text-[1.25vh] font-medium text-amber-700">
                阶段性回复 · 后台处理中
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Attachments (Images) */}
        {!useOrderedAssistantSegments && message.images && message.images.length > 0 && (
          <div className="mb-[0.85vh] flex flex-wrap gap-[0.85vh]">
            {message.images.map((img, idx) => (
              <img
                key={idx}
                src={resolveEdenAgentUrl(img)}
                alt="上传图片"
                onClick={() => onPreviewImage?.(resolveEdenAgentUrl(img), "上传图片")}
                className={cn(
                  "max-w-[32vh] cursor-pointer rounded-[1.35vh] border border-border object-cover shadow-sm transition-opacity hover:opacity-90",
                  isUser ? "h-[16vh] w-auto" : "w-[28vh] h-auto",
                )}
              />
            ))}
          </div>
        )}

        {useOrderedAssistantSegments
          ? orderedSegments?.map((segment) => {
              if (segment.type === "text") {
                return (
                  <TextSegment
                    key={segment.id}
                    segment={segment}
                    isUser={false}
                    messageId={message.id}
                    isMessageStreaming={message.isStreaming}
                    onTextReveal={onTextReveal}
                    ttsMode={ttsMode}
                    speechClips={speechClips}
                    activeSpeechSegmentId={activeSpeechSegmentId}
                    speechPaused={speechPaused}
                    getSpeechProgress={getSpeechProgress}
                    onToggleSpeech={onToggleSpeech}
                    onSeekSpeech={onSeekSpeech}
                    onBeginSeekSpeech={onBeginSeekSpeech}
                    onEndSeekSpeech={onEndSeekSpeech}
                  />
                )
              }
              if (segment.type === "runtimeTrace") {
                return (
                  <ThinkingBlock
                    key={segment.id}
                    content={segment.content}
                    state={segment.state}
                    title="运行过程"
                    cacheKey={`${message.id}:${segment.id}`}
                    onTextReveal={onTextReveal}
                    error={message.error?.message}
                  />
                )
              }
              if (segment.type === "thinking") {
                return (
                  <ThinkingBlock
                    key={segment.id}
                    content={segment.content}
                    state={segment.state}
                    cacheKey={`${message.id}:${segment.id}`}
                    onTextReveal={onTextReveal}
                  />
                )
              }
              if (segment.type === "tool") {
                return <ToolCard
                  key={segment.id}
                  tool={segment.tool}
                  subagentThreads={subagentThreads}
                  coordinationBatches={coordinationBatches}
                  onFollowupSubagent={onFollowupSubagent}
                  onInspectSubagent={onInspectSubagent}
                  onInterruptSubagent={onInterruptSubagent}
                />
              }
              if (segment.type === "meta") {
                return <MetaPartCard key={segment.id} part={segment.part} />
              }
              if (segment.type === "image") {
                const src = resolveEdenAgentUrl(segment.url)
                return (
                  <img
                    key={segment.id}
                    src={src}
                    alt={segment.filename || "图片"}
                    onClick={() => onPreviewImage?.(src, segment.filename || "图片")}
                    className="mb-[0.85vh] h-auto w-[28vh] cursor-pointer rounded-[1.35vh] border border-border object-cover shadow-sm transition-opacity hover:opacity-90"
                    draggable={false}
                  />
                )
              }
              if (segment.type === "sticker") {
                const src = resolveEdenAgentUrl(segment.url)
                return (
                  <img
                    key={segment.id}
                    src={src}
                    alt={segment.alt || segment.name}
                    title={segment.name}
                    onClick={() => onPreviewImage?.(src, segment.alt || segment.name)}
                    className="mb-[0.85vh] h-auto max-h-[22vh] w-auto max-w-[22vh] cursor-pointer object-contain drop-shadow-sm transition-transform hover:scale-[1.02]"
                    draggable={false}
                  />
                )
              }
              return null
            })
          : null}

        {useOrderedAssistantSegments && renderedContent && !message.isStreaming && <RawOutput content={renderedContent} />}

        {/* Assistant Runtime Trace */}
        {!useOrderedAssistantSegments && !isUser && message.runtimeTrace && (
          <ThinkingBlock
            content={message.runtimeTrace}
            state={message.runtimeTraceState}
            title="运行过程"
            cacheKey={`${message.id}:runtime`}
            onTextReveal={onTextReveal}
            error={message.error?.message}
          />
        )}

        {/* Assistant Thinking */}
        {!useOrderedAssistantSegments && !isUser && message.thinking && (
          <ThinkingBlock
            content={message.thinking}
            state={message.thinkingState}
            cacheKey={`${message.id}:thinking`}
            onTextReveal={onTextReveal}
          />
        )}

        {/* Assistant Tool Calls */}
        {!useOrderedAssistantSegments &&
          !isUser &&
          message.toolCalls &&
          message.toolCalls.map((tool) => <ToolCard
            key={tool.id}
            tool={tool}
            subagentThreads={subagentThreads}
            coordinationBatches={coordinationBatches}
            onFollowupSubagent={onFollowupSubagent}
            onInspectSubagent={onInspectSubagent}
            onInterruptSubagent={onInterruptSubagent}
          />)}

        {!useOrderedAssistantSegments &&
          !isUser &&
          message.metaParts &&
          message.metaParts.map((part) => <MetaPartCard key={part.id} part={part} />)}

        {/* Main Content Bubble */}
        {!useOrderedAssistantSegments && renderedContent && (
          <>
            <TextSegment
              segment={{
                id: `${message.id}:content`,
                type: "text",
                content: renderedContent,
                state: message.isStreaming ? "streaming" : "done",
              }}
              isUser={isUser}
              messageId={message.id}
              isMessageStreaming={message.isStreaming}
              onTextReveal={onTextReveal}
              ttsMode={ttsMode}
              speechClips={speechClips}
              activeSpeechSegmentId={activeSpeechSegmentId}
              speechPaused={speechPaused}
              getSpeechProgress={getSpeechProgress}
              onToggleSpeech={onToggleSpeech}
              onSeekSpeech={onSeekSpeech}
              onBeginSeekSpeech={onBeginSeekSpeech}
              onEndSeekSpeech={onEndSeekSpeech}
            />
            {!isUser && !message.isStreaming && <RawOutput content={renderedContent} />}
          </>
        )}

        {!isUser && message.error ? <MessageErrorCard error={message.error} /> : null}

        {allowOrganizingReply && shouldShowOrganizingReply(message) && (
          <div className="px-[0.45vh] text-[1.65vh] text-text-muted">正在组织回复...</div>
        )}
      </div>
    </div>
  )
}
