import type {
  CompanionDirectorRun,
  MetaPartCard,
  MessageData,
  MessageSegment,
  PendingPermission,
  PendingQuestion,
  RuntimeAgentPart,
  RuntimeCompactionPart,
  RuntimeFilePart,
  RuntimeMessage,
  RuntimePatchPart,
  RuntimePart,
  RuntimeReasoningPart,
  RuntimeRetryPart,
  RuntimeSession,
  RuntimeSnapshotPart,
  RuntimeStickerPart,
  RuntimeState,
  RuntimeStepFinishPart,
  RuntimeStepStartPart,
  RuntimeSubtaskPart,
  RuntimeTextPart,
  RuntimeToolPart,
  Session,
  ToolCall,
} from "../types"
import { isAssistantMessageStreaming, isRuntimeSessionRunning, runtimePartState } from "./session-stream-state"
import { formatLocalTime } from "./time"
import { presentRuntimeError } from "./runtime-error"
import { stripAssistantSpeakerPrefix } from "./assistant-message-text"

function isRuntimeTextPart(part: RuntimePart): part is RuntimeTextPart {
  return part.type === "text" && "text" in part && typeof part.text === "string"
}

function isRuntimeReasoningPart(part: RuntimePart): part is RuntimeReasoningPart {
  return part.type === "reasoning" && "text" in part && typeof part.text === "string"
}

function isRuntimeTracePart(part: RuntimeReasoningPart) {
  return part.source === "runtime" || part.id.endsWith("_runtime_thinking")
}

function isRuntimeFilePart(part: RuntimePart): part is RuntimeFilePart {
  return part.type === "file" && "mime" in part && typeof part.mime === "string" && "url" in part
}

function isRuntimeStickerPart(part: RuntimePart): part is RuntimeStickerPart {
  return part.type === "sticker" && "url" in part && typeof part.url === "string"
}

function isRuntimeToolPart(part: RuntimePart): part is RuntimeToolPart {
  return part.type === "tool" && "tool" in part && typeof part.tool === "string" && "state" in part
}

function formatNumber(value?: number) {
  if (typeof value !== "number") return undefined
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)
}

function mapMetaPart(part: RuntimePart): MetaPartCard | undefined {
  switch (part.type) {
    case "subtask": {
      const subtask = part as RuntimeSubtaskPart
      return {
        id: subtask.id,
        type: subtask.type,
        title: `Subtask: ${subtask.agent}`,
        summary: subtask.description,
        detail: [subtask.command, subtask.prompt].filter(Boolean).join("\n\n"),
        tone: "accent",
      }
    }
    case "step-start": {
      const stepStart = part as RuntimeStepStartPart
      return {
        id: stepStart.id,
        type: stepStart.type,
        title: "Step Started",
        summary: stepStart.snapshot ? "Snapshot captured for this step." : "Model step started.",
        detail: stepStart.snapshot,
        tone: "muted",
      }
    }
    case "step-finish": {
      const stepFinish = part as RuntimeStepFinishPart
      const tokenSummary = `input ${stepFinish.tokens.input}, output ${stepFinish.tokens.output}, reasoning ${stepFinish.tokens.reasoning}`
      return {
        id: stepFinish.id,
        type: stepFinish.type,
        title: "Step Finished",
        summary: `${stepFinish.reason} • ${tokenSummary}`,
        detail: `cost: ${formatNumber(stepFinish.cost) ?? stepFinish.cost}\ncache read: ${stepFinish.tokens.cache.read}\ncache write: ${stepFinish.tokens.cache.write}${stepFinish.snapshot ? `\n\n${stepFinish.snapshot}` : ""}`,
        tone: "default",
      }
    }
    case "snapshot": {
      const snapshot = part as RuntimeSnapshotPart
      return {
        id: snapshot.id,
        type: snapshot.type,
        title: "Snapshot",
        summary: snapshot.snapshot,
        detail: snapshot.snapshot,
        tone: "muted",
      }
    }
    case "patch": {
      const patch = part as RuntimePatchPart
      return {
        id: patch.id,
        type: patch.type,
        title: "Patch",
        summary: `${patch.files.length} file${patch.files.length === 1 ? "" : "s"}`,
        detail: [`hash: ${patch.hash}`, ...patch.files].join("\n"),
        tone: "accent",
      }
    }
    case "agent": {
      const agent = part as RuntimeAgentPart
      return {
        id: agent.id,
        type: agent.type,
        title: `Agent: ${agent.name}`,
        summary: agent.source?.value,
        detail: agent.source?.value,
        tone: "default",
      }
    }
    case "retry": {
      const retry = part as RuntimeRetryPart
      return {
        id: retry.id,
        type: retry.type,
        title: `Retry ${retry.attempt}`,
        summary: retry.error.message ?? "Provider retry triggered.",
        detail: retry.error.statusCode ? `status: ${retry.error.statusCode}` : undefined,
        tone: "warning",
      }
    }
    case "compaction": {
      const compaction = part as RuntimeCompactionPart
      const details = typeof compaction.details === "string"
        ? compaction.details
        : compaction.details
          ? JSON.stringify(compaction.details, null, 2)
          : undefined
      return {
        id: compaction.id,
        type: compaction.type,
        title: compaction.auto ? "自动压缩上下文" : "上下文压缩",
        summary: compaction.overflow ? "上下文接近容量上限，较早的对话已整理为摘要。" : "较早的对话已整理为摘要。",
        detail: compaction.summary || details,
        tone: "accent",
        contextTokensBefore: compaction.tokensBefore,
        contextTokensAfter: compaction.tokensAfter,
      }
    }
    default:
      return undefined
  }
}

function timeLabel(value?: number) {
  return formatLocalTime(value)
}

function stringify(value: unknown) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return String(value)
  }
}

function mapTool(part: RuntimeToolPart, sessionIsRunning = true): ToolCall {
  const state = part.state
  const start = state.time?.start
  const end = state.time?.end
  const interrupted = !sessionIsRunning && (state.status === "pending" || state.status === "running")
  return {
    id: part.id,
    name: part.tool,
    status: state.status === "completed" ? "success" : state.status === "aborted" || interrupted ? "aborted" : state.status === "error" ? "error" : "running",
    input: stringify("input" in state ? state.input : {}),
    output: "output" in state ? state.output : undefined,
    error: state.status === "error" || state.status === "aborted" ? state.error : interrupted ? "上一次运行在工具完成前已中止。" : undefined,
    errorCode: state.status === "error" || state.status === "aborted" ? state.errorCode : undefined,
    retryable: state.status === "error" || state.status === "aborted" ? state.retryable : undefined,
    details: state.details,
    duration: start && end ? end - start : undefined,
  }
}

function partsInOrder(message: RuntimeMessage) {
  return message.partOrder.map((partID) => message.parts[partID]).filter(Boolean)
}

function userMessageSignature(message: RuntimeMessage) {
  if (message.role !== "user") return undefined
  const parts = partsInOrder(message)
  const text = parts
    .filter(isRuntimeTextPart)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim()
  const images = parts
    .filter((part): part is RuntimeFilePart => isRuntimeFilePart(part) && part.mime.startsWith("image/"))
    .map((part) => `${part.filename ?? ""}:${part.mime}`)
  if (!text && images.length === 0) return undefined
  return `${text}||${images.join("|")}`
}

function visibleMessages(session: RuntimeSession) {
  const serverUsers = session.messageOrder
    .map((messageID) => session.messages[messageID])
    .filter((message): message is RuntimeMessage => Boolean(message && !message.localOnly && message.role === "user"))
  const availableServerUsers = serverUsers.filter((message) => !message.renderKey || message.renderKey === message.id)
  const serverUsersBySignature = new Map<string, RuntimeMessage[]>()
  for (const message of availableServerUsers) {
    const signature = userMessageSignature(message)
    if (!signature) continue
    const matches = serverUsersBySignature.get(signature) ?? []
    matches.push(message)
    serverUsersBySignature.set(signature, matches)
  }
  const consumedServerIDs = new Set<string>()

  return session.messageOrder
    .map((messageID) => session.messages[messageID])
    .filter(Boolean)
    .filter((message) => {
      if (!message.localOnly || message.role !== "user") return true
      if (message.deliveryState === "failed") return true
      const exactServer = message.turnID
        ? availableServerUsers.find((candidate) => candidate.turnID === message.turnID && !consumedServerIDs.has(candidate.id))
        : undefined
      const signature = userMessageSignature(message)
      if (!exactServer && (!signature || message.turnID)) return true
      const matches = signature ? serverUsersBySignature.get(signature) : undefined
      const serverIndex = exactServer ? -1 : matches?.findIndex((candidate) =>
        !consumedServerIDs.has(candidate.id) && (
          typeof candidate.createdAt !== "number" ||
          typeof message.createdAt !== "number" ||
          Math.abs(candidate.createdAt - message.createdAt) < 30_000
        ),
      ) ?? -1
      const serverMessage = exactServer ?? (serverIndex >= 0 ? matches?.[serverIndex] : undefined)
      if (!serverMessage) return true
      consumedServerIDs.add(serverMessage.id)
      return false
    })
}

function mapMessage(message: RuntimeMessage, sessionIsRunning: boolean): MessageData {
  const parts = partsInOrder(message)
  const rawTextParts = parts.filter(isRuntimeTextPart)
  let shouldStripSpeakerPrefix = message.role === "assistant"
  const textParts = rawTextParts.map((part) => {
    if (!shouldStripSpeakerPrefix || !part.text.trim()) return part
    shouldStripSpeakerPrefix = false
    return {
      ...part,
      text: stripAssistantSpeakerPrefix(part.text, [
        message.speaker?.assistantName,
        message.speaker?.characterName,
        "助手",
      ]),
    }
  })
  const reasoningParts = parts.filter(isRuntimeReasoningPart)
  const runtimeTraceParts = reasoningParts.filter(isRuntimeTracePart)
  const modelReasoningParts = reasoningParts.filter((part) => !isRuntimeTracePart(part))
  const toolParts = parts.filter(isRuntimeToolPart)
  const content = textParts
    .map((part) => part.text)
    .join("\n")
    .trim()
  const runtimeTrace = runtimeTraceParts
    .map((part) => part.text)
    .join("\n")
    .trim()
  const thinking = modelReasoningParts
    .map((part) => part.text)
    .join("\n")
    .trim()
  const images = parts
    .filter((part): part is RuntimeFilePart => isRuntimeFilePart(part) && part.mime.startsWith("image/"))
    .map((part) => part.url)
  const toolCalls = toolParts.map((part) => mapTool(part, sessionIsRunning))
  const metaParts = parts.map(mapMetaPart).filter((part): part is MetaPartCard => Boolean(part))
  const hasRunningTool = toolParts.some((part) => part.state.status === "pending" || part.state.status === "running")
  const isStreaming = isAssistantMessageStreaming(
    sessionIsRunning,
    message.role === "assistant",
    !message.completedAt ||
      textParts.some((part) => !part.done) ||
      reasoningParts.some((part) => !part.done) ||
      hasRunningTool,
  )
  const runtimeTraceState = runtimeTrace
    ? runtimePartState(sessionIsRunning, runtimeTraceParts.some((part) => !part.done))
    : undefined
  const thinkingState = thinking
    ? runtimePartState(sessionIsRunning, modelReasoningParts.some((part) => !part.done))
    : undefined
  const segments = parts
    .flatMap((part): MessageSegment[] => {
      if (isRuntimeTextPart(part)) {
        return part.text
          ? [
              {
                id: part.id,
                type: "text",
                content: part.text,
                state: runtimePartState(sessionIsRunning, !part.done),
              },
            ]
          : []
      }
      if (isRuntimeReasoningPart(part)) {
        if (!part.text) return []
        return [
          {
            id: part.id,
            type: isRuntimeTracePart(part) ? "runtimeTrace" : "thinking",
            content: part.text,
            state: runtimePartState(sessionIsRunning, !part.done),
          },
        ]
      }
      if (isRuntimeToolPart(part)) {
        return [{ id: part.id, type: "tool", tool: mapTool(part, sessionIsRunning) }]
      }
      if (isRuntimeFilePart(part) && part.mime.startsWith("image/")) {
        return [{ id: part.id, type: "image", url: part.url, filename: part.filename }]
      }
      if (isRuntimeStickerPart(part)) {
        return [{ id: part.id, type: "sticker", url: part.url, name: part.name, alt: part.alt }]
      }
      const metaPart = mapMetaPart(part)
      return metaPart ? [{ id: part.id, type: "meta", part: metaPart }] : []
    })
    .filter((segment) => {
      if (message.role !== "assistant") return true
      if (segment.type === "image") return true
      if (segment.type === "sticker") return true
      if (segment.type === "text") return Boolean(segment.content.trim())
      if (segment.type === "runtimeTrace" || segment.type === "thinking") return Boolean(segment.content.trim())
      return true
    })

  return {
    id: message.id,
    kind: message.kind,
    renderKey: message.renderKey ?? message.id,
    speechEpoch: message.speechEpoch ?? 0,
    speechResetReason: message.speechResetReason,
    runID: message.runID,
    role: message.role,
    content,
    timestamp: timeLabel(message.createdAt),
    segments: segments.length ? segments : undefined,
    runtimeTrace: runtimeTrace || undefined,
    runtimeTraceState,
    thinking: thinking || undefined,
    thinkingState,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    metaParts: metaParts.length ? metaParts : undefined,
    images: images.length ? images : undefined,
    isStreaming,
    deliveryState: message.deliveryState,
    error: message.error
      ? message.role === "user" && message.deliveryState === "failed"
        ? {
            title: "消息发送失败",
            message: message.error.message || "消息未能提交，请稍后重试。",
            detail: message.error.data?.message,
          }
        : presentRuntimeError(message.error, message.providerID, message.modelID)
      : undefined,
    completionState: message.completionState,
    coordinationBatchID: message.coordinationBatchID,
    speaker: message.speaker,
    orchestration: message.orchestration,
  }
}

function directorRunFromMessages(session: RuntimeSession): CompanionDirectorRun | undefined {
  const lastUserIndex = session.messageOrder.reduce(
    (found, messageID, index) => (session.messages[messageID]?.role === "user" ? index : found),
    -1,
  )
  const candidates = session.messageOrder
    .slice(lastUserIndex + 1)
    .map((messageID) => session.messages[messageID])
    .filter((message): message is RuntimeMessage => Boolean(message?.speaker && message.orchestration?.planID))
  const planID = candidates.at(-1)?.orchestration?.planID
  if (!planID) return undefined
  const planMessages = candidates
    .filter((message) => message.orchestration?.planID === planID)
    .sort(
      (left, right) =>
        (left.orchestration?.beatIndex ?? left.speaker?.beatIndex ?? 0) -
        (right.orchestration?.beatIndex ?? right.speaker?.beatIndex ?? 0),
    )
  const beats = planMessages.map((message) => ({
    assistantID: message.speaker!.assistantID,
    intent: message.orchestration?.intent || "参与当前对话",
    speechAct: message.orchestration?.speechAct || "respond",
    addressTo: message.orchestration?.addressTo || "user",
    replyToBeat: message.orchestration?.replyToBeat,
  }))
  return {
    planID,
    userMessageID: session.messageOrder[lastUserIndex],
    source: planMessages[0]?.orchestration?.directorSource,
    diagnostic: planMessages[0]?.orchestration?.directorDiagnostic,
    scene: planMessages[0]?.orchestration?.scene,
    execution: planMessages[0]?.orchestration?.execution,
    beats,
    status: "completed",
    completedBeatIndexes: beats.map((_, index) => index),
    participantCount: session.participants?.length,
  }
}

function mapSession(session: RuntimeSession): Session {
  const sessionIsRunning = isRuntimeSessionRunning(session.status)
  const messages = visibleMessages(session).map((message) => mapMessage(message, sessionIsRunning))
  const inferredDirectorRun = directorRunFromMessages(session)
  const directorRuns = session.directorRuns?.length
    ? session.directorRuns
    : inferredDirectorRun
      ? [inferredDirectorRun]
      : []
  return {
    id: session.id,
    title: session.title || "新会话",
    updatedAt: session.updatedAt,
    contextTokens: session.contextTokens,
    tokenBreakdown: session.tokenBreakdown,
    date: timeLabel(session.updatedAt),
    messages,
    hasMoreMessages: session.hasMoreMessages,
    loadingOlderMessages: session.loadingOlderMessages,
    mode: session.mode,
    participants: session.participants,
    assistantHandoff: session.assistantHandoff,
    directorRun: session.directorRun ?? inferredDirectorRun,
    directorRuns,
    agentThreads: session.agentThreads,
    coordinationBatches: session.coordinationBatches,
  }
}

export function selectSessions(state: RuntimeState): Session[] {
  return state.sessionOrder
    .map((sessionID) => state.sessions[sessionID])
    .filter(Boolean)
    .map(mapSession)
}

export function selectActiveSession(state: RuntimeState): Session | undefined {
  if (!state.activeSessionId) return undefined
  const session = state.sessions[state.activeSessionId]
  return session ? mapSession(session) : undefined
}

export function selectSessionStatus(state: RuntimeState, sessionID?: string) {
  if (!sessionID) return "idle" as const
  return state.sessions[sessionID]?.status ?? "idle"
}

export function selectPendingPermissions(state: RuntimeState, sessionID?: string): PendingPermission[] {
  if (!sessionID) return []
  return state.permissionOrder
    .map((requestID) => state.permissions[requestID])
    .filter((request): request is PendingPermission => Boolean(request && request.sessionID === sessionID))
}

export function selectPendingQuestions(state: RuntimeState, sessionID?: string): PendingQuestion[] {
  return state.questionOrder
    .map((requestID) => state.questions[requestID])
    .filter((request): request is PendingQuestion => Boolean(request && (!sessionID || request.sessionID === sessionID)))
}
