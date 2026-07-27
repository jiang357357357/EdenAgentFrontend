import type { CoordinationBatch, MessageData, MessageSegment, SubagentThread, SubagentThreadDetails } from "../types"
import { ToolCard } from "./ToolCard"
import { ThinkingBlock } from "./ThinkingBlock"
import { MetaPartCard } from "./MetaPartCard"
import { cn } from "../lib/utils"
import { resolveMonAgentUrl } from "../lib/mon_agent_api"
import { resolveCoreAssetUrl } from "../lib/auth"
import { MarkdownContent } from "./MarkdownContent"
import { AlertTriangle, Code2, LoaderCircle, Pause, Play, User } from "lucide-react"
import { useTypewriterText } from "../hooks/useTypewriterText"
import type { SpeechClip } from "../hooks/useTTSSpeech"
import type { PetTTSMode } from "../lib/desktop-window"
import { textForTTS } from "../lib/tts-text"
import type { MessageError } from "../types"
import { shouldShowOrganizingReply, type MessageGroupPosition } from "../lib/message-grouping"

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
  onToggleSpeech?: (segmentId: string, text: string, messageId: string) => void
  groupPosition?: MessageGroupPosition
  allowOrganizingReply?: boolean
  subagentThreads?: SubagentThread[]
  coordinationBatches?: CoordinationBatch[]
  onFollowupSubagent?: (target: string, message: string) => Promise<unknown>
  onInspectSubagent?: (target: string) => Promise<SubagentThreadDetails>
  onInterruptSubagent?: (target: string) => Promise<unknown>
}

interface TextSegmentProps {
  segment: Extract<MessageSegment, { type: "text" }>
  isUser: boolean
  messageId: string
  isMessageStreaming?: boolean
  onTextReveal?: () => void
  ttsMode: PetTTSMode
  speechClips: Record<string, SpeechClip>
  activeSpeechSegmentId?: string | null
  speechPaused: boolean
  onToggleSpeech?: (segmentId: string, text: string, messageId: string) => void
}

function TextSegment({
  segment,
  isUser,
  messageId,
  isMessageStreaming,
  onTextReveal,
  ttsMode,
  speechClips,
  activeSpeechSegmentId,
  speechPaused,
  onToggleSpeech,
}: TextSegmentProps) {
  const visibleContent = useTypewriterText({
    active: !isUser && Boolean(isMessageStreaming) && segment.state === "streaming",
    cacheKey: `${messageId}:${segment.id}`,
    target: segment.content,
    onFrame: onTextReveal,
  })
  const speechSegmentId = segment.id
  const clip = speechClips[speechSegmentId]
  const segmentComplete = segment.state !== "streaming"
  const canSpeak = segmentComplete && Boolean(textForTTS(visibleContent, ttsMode))
  const playing = activeSpeechSegmentId === speechSegmentId && !speechPaused

  return (
    <div
      className={cn(
        "relative text-[1.82vh] leading-[1.58]",
        isUser
          ? "rounded-[2vh] rounded-tr-[0.45vh] border border-border bg-card px-[2.05vh] py-[1.35vh] font-sans text-text"
          : "w-full max-w-none bg-transparent px-[2.05vh] py-[0.35vh] text-text prose",
      )}
    >
      {isUser ? (
        <div className="whitespace-pre-wrap">{visibleContent}</div>
      ) : (
        <div className="flex min-w-0 items-end gap-[0.8vh]">
          <div className="markdown-body min-w-0 flex-1">
            <MarkdownContent
              content={visibleContent}
              paragraphClassName="my-0"
              separateActionLines
              actionParagraphClassName="my-0 italic text-accent/85"
            />
          </div>
          {canSpeak && clip?.status === "synthesizing" ? (
            <LoaderCircle className="mb-[0.35vh] h-[1.8vh] w-[1.8vh] shrink-0 animate-spin text-text-muted" aria-label="正在合成语音" />
          ) : null}
          {canSpeak && clip?.status !== "synthesizing" ? (
            <button
              type="button"
              onClick={() => onToggleSpeech?.(speechSegmentId, visibleContent, messageId)}
              className={cn(
                "mb-[0.15vh] flex h-[2.5vh] w-[2.5vh] shrink-0 items-center justify-center rounded-full transition-colors",
                playing ? "bg-accent/10 text-accent" : clip?.status === "error" ? "text-red-500" : "text-text-muted hover:bg-bg hover:text-accent",
              )}
              aria-label={playing ? "暂停这段语音" : "播放这段语音"}
              title={clip?.status === "error"
                ? `重新合成并播放${clip.error ? `：${clip.error}` : ""}`
                : playing ? "暂停" : "播放"}
            >
              {playing ? <Pause className="h-[1.45vh] w-[1.45vh] fill-current" /> : <Play className="h-[1.45vh] w-[1.45vh] fill-current" />}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function RawOutput({ content }: { content: string }) {
  return (
    <details className="mx-[2.05vh] mb-[0.45vh] rounded-[1.1vh] border border-border bg-bg/60 text-[1.42vh] text-text-muted">
      <summary className="flex cursor-pointer select-none items-center gap-[0.8vh] px-[1.2vh] py-[0.8vh]">
        <Code2 className="h-[1.65vh] w-[1.65vh]" />
        原始输出
      </summary>
      <pre className="max-h-[32vh] overflow-auto whitespace-pre-wrap border-t border-border px-[1.2vh] py-[0.8vh] font-mono text-[1.34vh] leading-[1.6] text-text">
        {content}
      </pre>
    </details>
  )
}

function MessageErrorCard({ error }: { error: MessageError }) {
  return (
    <div className="mx-[0.45vh] my-[0.7vh] w-[calc(100%-0.9vh)] rounded-[1.25vh] border border-red-200/80 bg-red-50/65 px-[1.45vh] py-[1.2vh] font-sans text-red-950">
      <div className="flex items-start gap-[0.9vh]">
        <AlertTriangle className="mt-[0.15vh] h-[1.8vh] w-[1.8vh] shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-[1vh] gap-y-[0.45vh]">
            <span className="text-[1.58vh] font-medium text-red-700">{error.title}</span>
            {error.model ? (
              <span className="rounded-full border border-red-200/80 bg-white/55 px-[0.75vh] py-[0.18vh] font-mono text-[1.15vh] text-red-500">
                {error.model}
              </span>
            ) : null}
          </div>
          <p className="mt-[0.45vh] text-[1.4vh] leading-[1.55] text-red-800/85">{error.message}</p>
          {error.detail ? (
            <details className="mt-[0.7vh] text-[1.22vh] text-red-700/75">
              <summary className="cursor-pointer select-none hover:text-red-700">查看技术详情</summary>
              <pre className="mt-[0.55vh] max-h-[18vh] overflow-auto whitespace-pre-wrap break-words rounded-[0.75vh] border border-red-200/70 bg-white/50 px-[0.9vh] py-[0.7vh] font-mono text-[1.15vh] leading-[1.5] text-red-900/75">
                {error.detail}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
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
  onToggleSpeech,
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
                src={resolveMonAgentUrl(img)}
                alt="上传图片"
                onClick={() => onPreviewImage?.(resolveMonAgentUrl(img), "上传图片")}
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
                    onToggleSpeech={onToggleSpeech}
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
                const src = resolveMonAgentUrl(segment.url)
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
              onToggleSpeech={onToggleSpeech}
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
