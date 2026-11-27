import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { Check, Copy, Trash2 } from "lucide-react"
import { MarkdownBody } from "./MarkdownBody"
import { MobileMessageImage } from "./MobileMessageImage"
import { MobileThinkingTrace, MobileToolTrace } from "./MobileTrace"
import { MobileVoiceBar, type TranscriptAudio } from "./MobileVoiceBar"
import { useTranscriptAudio, type VoiceMessage } from "./mobile-transcript-audio"
import { messageGroupPosition, type MessageGroupMember, type MessageGroupPosition } from "../../../lib/message-grouping"
import "./mobile-transcript.css"

interface Part {
  type: string
  text?: string
  name?: string
  asset?: string
  event?: string
  durationMs?: number
  status?: "running" | "completed" | "error" | "aborted"
  input?: string
  output?: string
}
interface Message {
  id: string
  text: string
  outgoing: boolean
  turnId?: string
  sender?: string
  assistantId?: string
  characterId?: number
  senderAvatar?: string
  replyEvent?: string
  created?: number
  parts: Part[]
}
interface Transcript {
  messages: Message[]
  hasOlder: boolean
  loading: boolean
  replyPending: boolean
  callActive: boolean
  replyPlayback?: { id: string; messageIds: string[] }
  autoScroll: boolean
  theme: { base: string; accent: string; dark: boolean; colors: Record<string, string> }
  fontSize: number
  assistantName?: string
  avatar?: string
  profileAvatar?: string
  copiedReply?: string
}

const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" })

function groupMember(message: Message): MessageGroupMember {
  return {
    id: message.id, role: message.outgoing ? "user" : "assistant",
    ...(message.turnId ? {runID: message.turnId} : {}),
    speaker: {
      ...(message.assistantId ? {assistantID: message.assistantId} : {}),
      ...(message.characterId ? {characterID: message.characterId} : {}),
      ...(message.sender ? {characterName: message.sender} : {}),
    },
  }
}

function MessageAvatar({src, name}: {src?: string; name: string}) {
  const [failed, setFailed] = useState(false)
  return <div className="avatar">
    {src && !failed ? <img src={src} alt={`${name}的头像`} onError={() => setFailed(true)} /> : name.slice(0, 1)}
  </div>
}

function assetUrl(part: Part) {
  return part.asset && part.event ? `/asset/${encodeURIComponent(part.event)}/${encodeURIComponent(part.asset)}` : undefined
}

function replySpeech(message: Message) {
  return message.parts.flatMap(part => {
    const url = part.type === "speech" ? assetUrl(part) : undefined
    return url ? [{ url, duration: (part.durationMs ?? 0) / 1000 }] : []
  })
}

function ReplyActions({event, copied, disabled}: {event: string; copied: boolean; disabled: boolean}) {
  const CopyIcon = copied ? Check : Copy
  const copyLabel = copied ? "已复制" : "复制回答"
  return <div className="reply-actions">
    <a className="reply-icon" role="button" aria-label={copyLabel} title={copyLabel}
      aria-disabled={disabled} href={disabled ? undefined : `/reply/copy/${encodeURIComponent(event)}`}>
      <CopyIcon aria-hidden="true" />
    </a>
    <a className="reply-icon" role="button" aria-label="删除回答" title="删除回答"
      aria-disabled={disabled} href={disabled ? undefined : `/reply/delete/${encodeURIComponent(event)}`}>
      <Trash2 aria-hidden="true" />
    </a>
  </div>
}

const ChatRow = memo(function ChatRow({message, assistantName, avatar, profileAvatar, audio, copied, loading, group, pending}:
  Pick<Transcript, "assistantName" | "avatar" | "profileAvatar" | "loading"> &
  {message: Message; audio: TranscriptAudio; copied: boolean; group: MessageGroupPosition; pending: boolean}) {
  const name = message.outgoing ? "你" : message.sender || assistantName || "助手"
  const parts = message.parts.length ? message.parts : [{type: "text", text: message.text}]
  const resolveImage = useCallback((source: string) => {
    if (!source) return undefined
    for (const part of message.parts) {
      if (part.type !== "image") continue
      const url = assetUrl(part)
      if (url && (url === source || part.name === source || `./${part.name}` === source)) return url
    }
    return undefined
  }, [message.parts])
  const speech = replySpeech(message)
  const avatarSource = message.outgoing ? profileAvatar : message.senderAvatar ?? avatar
  const startsGroup = group === "single" || group === "first"
  const endsGroup = group === "single" || group === "last"
  return <article className={message.outgoing ? "message outgoing" : `message incoming reply-${group}`}>
    {startsGroup ? <MessageAvatar key={avatarSource} src={avatarSource} name={name} />
      : <div className="avatar-space" aria-hidden="true" />}
    <div className="body">
      {startsGroup && <header>{name}{message.created && <time>{time.format(message.created)}</time>}</header>}
      <div className="message-content">
        {parts.map((part, index) => {
          const asset = assetUrl(part)
          switch (part.type) {
            case "speech":
              return null
            case "audio":
              return asset ? <MobileVoiceBar key={index} messageId={message.id} clipKey={`${message.id}:audio:${index}`}
                clips={[{url: asset, duration: (part.durationMs ?? 0) / 1000}]} audio={audio} />
                : <div className="attachment" key={index}>{part.name || "语音"}</div>
            case "image":
            case "sticker":
              return asset ? <MobileMessageImage key={`${index}:${asset}`} src={asset} label={part.name || "消息图片"}
                sticker={part.type === "sticker"} /> : <div key={index} className="attachment">{part.name || "图片"}</div>
            case "attachment":
              return asset ? <a className="attachment" key={index} href={asset + "?download=1&name=" + encodeURIComponent(part.name || "附件")}>
                {part.name || "附件"}</a> : <div key={index} className="attachment">{part.name || "附件"}</div>
            case "tool":
              return <MobileToolTrace key={index} name={part.name} status={part.status} input={part.input} output={part.output} />
            case "thinking":
              return part.text ? <MobileThinkingTrace key={index} text={part.text} running={part.status === "running"} /> : null
            default:
              return <div key={index} className="markdown"><MarkdownBody content={part.text ?? ""}
                resolveImage={resolveImage} imageClassName="photo" separateActionLines={!message.outgoing}
                actionParagraphClassName="action" /></div>
          }
        })}
        {speech.length > 0 && <MobileVoiceBar messageId={message.id} clipKey={`${message.id}:speech`} clips={speech} audio={audio} />}
      </div>
      {!message.outgoing && endsGroup && !pending && message.replyEvent &&
        <ReplyActions event={message.replyEvent} copied={copied} disabled={loading} />}
    </div>
  </article>
})

function History(props: Transcript) {
  const audio = useTranscriptAudio(props.callActive)
  const consumedPlayback = useRef<string | null>(null)
  const { playSequence, stopSequence } = audio
  useEffect(() => {
    const request = props.replyPlayback
    if (!request || props.callActive) {
      stopSequence()
      return
    }
    if (request.id === consumedPlayback.current) return
    consumedPlayback.current = request.id
    const messages = new Map(props.messages.map(message => [message.id, message]))
    const sequence: VoiceMessage[] = []
    for (const messageId of request.messageIds) {
      const message = messages.get(messageId)
      const clips = message ? replySpeech(message) : []
      if (clips.length) sequence.push({ key: `${messageId}:speech`, messageId, clips })
    }
    playSequence(sequence)
  }, [props.replyPlayback, props.messages, props.callActive, playSequence, stopSequence])
  const groupMembers = useMemo(() => props.messages.map(groupMember), [props.messages])
  const discardRemoved = audio.discardRemoved
  useEffect(() => discardRemoved(new Set(props.messages.map(message => message.id))), [discardRemoved, props.messages])
  const previous = useRef({first: "", total: 0, height: 0, top: 0})
  const first = props.messages[0]?.id ?? ""
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.baseTheme = props.theme.base
    root.dataset.accentTheme = props.theme.accent
    root.style.colorScheme = props.theme.dark ? "dark" : "light"
    root.style.fontSize = `${props.fontSize}px`
    for (const [key, color] of Object.entries(props.theme.colors)) root.style.setProperty(key, color)
  }, [props.theme, props.fontSize])
  useLayoutEffect(() => {
    const scroller = document.scrollingElement
    if (!scroller) return
    const last = previous.current
    const prepended = last.first && first !== last.first && props.messages.some(m => m.id === last.first)
    if (prepended) scroller.scrollTop = last.top + scroller.scrollHeight - last.height
    else if (!last.total || (props.autoScroll && last.height - last.top - scroller.clientHeight < 140)) {
      scroller.scrollTop = scroller.scrollHeight
    }
    const remember = () => {
      previous.current = { first, total: props.messages.length, height: scroller.scrollHeight, top: scroller.scrollTop }
    }
    remember()
    window.addEventListener("scroll", remember, {passive: true})
    return () => window.removeEventListener("scroll", remember)
  }, [first, props.messages, props.autoScroll, props.fontSize])
  return <main aria-label="聊天消息">
    {props.hasOlder && <nav><a aria-disabled={props.loading} href={props.loading ? undefined : "/history"}>加载更早的消息</a></nav>}
    {!props.hasOlder && !props.messages.length && !props.loading && <nav>此会话暂无消息</nav>}
    {props.messages.map((message, index) => <ChatRow key={message.id} message={message}
      assistantName={props.assistantName} avatar={props.avatar} profileAvatar={props.profileAvatar}
      audio={audio} copied={Boolean(props.copiedReply && props.copiedReply === message.replyEvent)} loading={props.loading}
      group={messageGroupPosition(groupMembers, index)}
      pending={props.replyPending && index === props.messages.length - 1} />)}
  </main>
}

const root = createRoot(document.getElementById("root")!)
Object.assign(window, {edenTranscript: (data: Transcript) => root.render(<History {...data} />)})
