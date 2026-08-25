import {
  EdenAgentRpcClient,
  EDEN_AGENT_TOKEN_PROTOCOL_PREFIX,
  EDEN_AGENT_WEBSOCKET_PROTOCOL,
  uploadBlob,
  type AttachmentRef,
  type MemoInfo,
  type RpcMethodMap,
  type SessionEvent,
} from "../generated/eden-agent-rpc"
import { getStoredRuntimeOrigin } from "./runtime-origin"
import type {
  CompanionDirectorExecution,
  CompanionDirectorScene,
  PromptAttachment,
  SubagentResult,
  SubagentStatus,
  SubagentThread,
} from "../types"
import type {
  ApiMessage,
  ApiMessageInfo,
  ApiPart,
  ApiSession,
  ApiToolPart,
  ApiToolState,
  SessionParticipant,
} from "./agent-client"

const env = (import.meta as unknown as {
  env?: {
    DEV?: boolean
    VITE_EDEN_AGENT_BASE_URL?: string
    VITE_EDEN_AGENT_CAPABILITY_TOKEN?: string
  }
}).env

const httpBaseUrl = env?.DEV
  ? "http://127.0.0.1:40092"
  : (env?.VITE_EDEN_AGENT_BASE_URL ?? "http://127.0.0.1:40092").replace(/\/$/, "")
const websocketUrl = `${httpBaseUrl.replace(/^http/, "ws")}/rpc`

let client: EdenAgentRpcClient | undefined
let connection: Promise<EdenAgentRpcClient> | undefined
let connectedOrigin: "mon" | "local" | undefined
const eventListeners = new Set<(event: SessionEvent) => void>()
const statusListeners = new Set<(connected: boolean, error?: string) => void>()
const reconnectInitialDelayMs = 500
const reconnectMaxDelayMs = 10_000
const voiceBlobUrls = new Map<string, Promise<string>>()

async function capabilityToken(): Promise<string> {
  const configured = env?.VITE_EDEN_AGENT_CAPABILITY_TOKEN?.trim()
  if (configured) return configured
  const desktop = await window.edenAgentDesktop?.getAgentCapability?.()
  if (desktop?.token) return desktop.token
  throw new Error("Eden Agent capability token is unavailable")
}

async function connectedClient(): Promise<EdenAgentRpcClient> {
  const requestedOrigin = getStoredRuntimeOrigin() ?? "mon"
  if (client && connectedOrigin !== requestedOrigin) {
    client.close()
    client = undefined
    connection = undefined
    connectedOrigin = undefined
  }
  if (client) return client
  if (connection) return connection
  connection = (async () => {
    const next = new EdenAgentRpcClient()
    try {
      const token = await capabilityToken()
      const initialized = await next.connect(websocketUrl, token, "dev", requestedOrigin)
      if (initialized.runtimeOrigin !== requestedOrigin) {
        throw new Error(
          `Eden Agent runtime origin mismatch: requested ${requestedOrigin}, received ${initialized.runtimeOrigin}`,
        )
      }
    } catch (error) {
      next.close()
      throw error
    }
    next.on("session.event", (event) => {
      for (const listener of eventListeners) listener(event)
    })
    next.onClose(() => {
      if (client !== next) return
      client = undefined
      connection = undefined
      connectedOrigin = undefined
      for (const listener of statusListeners) listener(false, "Eden Agent RPC connection closed")
    })
    client = next
    connectedOrigin = requestedOrigin
    for (const listener of statusListeners) listener(true)
    return next
  })().catch((error) => {
    connection = undefined
    for (const listener of statusListeners) {
      listener(false, error instanceof Error ? error.message : String(error))
    }
    throw error
  })
  return connection
}

export async function rpcRequest<K extends keyof RpcMethodMap>(
  method: K,
  params: RpcMethodMap[K]["params"],
): Promise<RpcMethodMap[K]["result"]> {
  const current = await connectedClient()
  return current.request(method, params)
}

export async function rpcRequestWithTimeout<K extends keyof RpcMethodMap>(
  method: K,
  params: RpcMethodMap[K]["params"],
  timeoutMs: number,
): Promise<RpcMethodMap[K]["result"]> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      rpcRequest(method, params),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`请求 ${String(method)} 超时（${Math.ceil(timeoutMs / 1000)} 秒）`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function createRealtimeSttSocket(sessionId: string): Promise<WebSocket> {
  const token = await capabilityToken()
  const url = new URL(`${httpBaseUrl.replace(/^http/, "ws")}/voice/stt/realtime`)
  url.searchParams.set("session_id", sessionId)
  return new WebSocket(url, [
    EDEN_AGENT_WEBSOCKET_PROTOCOL,
    `${EDEN_AGENT_TOKEN_PROTOCOL_PREFIX}${token}`,
  ])
}

export function resolveVoiceBlobUrl(blobId: string): Promise<string> {
  const existing = voiceBlobUrls.get(blobId)
  if (existing) return existing
  const pending = (async () => {
    const token = await capabilityToken()
    const response = await fetch(`${httpBaseUrl}/blobs/${encodeURIComponent(blobId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error(`Unable to read speech audio: ${response.status}`)
    return URL.createObjectURL(await response.blob())
  })().catch((error) => {
    voiceBlobUrls.delete(blobId)
    throw error
  })
  voiceBlobUrls.set(blobId, pending)
  return pending
}

export async function subscribeRpcEvents(
  onEvent: (event: SessionEvent) => void,
  onStatus?: (connected: boolean, error?: string) => void,
): Promise<() => void> {
  let disposed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let reconnectAttempt = 0
  let connecting = false
  let connected = false

  const clearReconnectTimer = () => {
    if (!reconnectTimer) return
    clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  const connect = () => {
    if (disposed || connecting || connected) return
    connecting = true
    void connectedClient()
      .then(() => {
        if (!disposed && !connected) statusListener(true)
      })
      .catch(() => {
        // connectedClient broadcasts the concrete failure through statusListeners.
      })
      .finally(() => {
        connecting = false
      })
  }

  const scheduleReconnect = () => {
    if (disposed || connected || reconnectTimer) return
    const delay = Math.min(reconnectInitialDelayMs * (2 ** reconnectAttempt), reconnectMaxDelayMs)
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      connect()
    }, delay)
  }

  const statusListener = (nextConnected: boolean, error?: string) => {
    if (disposed) return
    connected = nextConnected
    onStatus?.(nextConnected, error)
    if (nextConnected) {
      reconnectAttempt = 0
      clearReconnectTimer()
    } else {
      scheduleReconnect()
    }
  }

  eventListeners.add(onEvent)
  statusListeners.add(statusListener)
  connect()
  return () => {
    disposed = true
    clearReconnectTimer()
    eventListeners.delete(onEvent)
    statusListeners.delete(statusListener)
  }
}

async function attachmentBlob(attachment: PromptAttachment | string): Promise<{ blob: Blob; filename?: string }> {
  const normalized = typeof attachment === "string"
    ? { url: attachment, mime: "image/png", filename: "image.png" }
    : attachment
  const response = await fetch(normalized.url)
  if (!response.ok) throw new Error(`Unable to read attachment: ${response.status}`)
  const source = await response.blob()
  return {
    blob: source.type ? source : new Blob([source], { type: normalized.mime || "application/octet-stream" }),
    filename: normalized.filename,
  }
}

export async function uploadAttachments(
  attachments: Array<PromptAttachment | string>,
): Promise<AttachmentRef[]> {
  const token = await capabilityToken()
  return Promise.all(attachments.map(async (attachment) => {
    const { blob, filename } = await attachmentBlob(attachment)
    const info = await uploadBlob(httpBaseUrl, token, blob)
    return { blobId: info.id, mime: info.mime, ...(filename ? { filename } : {}) }
  }))
}

type JsonObject = Record<string, unknown>

function apiParticipants(value: unknown): SessionParticipant[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((rawParticipant): SessionParticipant[] => {
    const participant = jsonObject(rawParticipant)
    if (!participant) return []
    const assistantID = optionalID(participant.assistantId ?? participant.assistantID)
    if (assistantID === undefined) return []
    const profile = jsonObject(participant.profile)
    const character = jsonObject(profile?.character)
    return [{
      assistantID,
      assistantName: optionalString(participant.assistantName) ?? "",
      characterID: optionalID(participant.characterId ?? participant.characterID),
      characterName: optionalString(participant.characterName),
      signature: optionalString(participant.signature),
      avatarUrl: optionalString(participant.avatarUrl),
      standingImageUrl: optionalString(participant.standingImageUrl),
      ttsConfigID: participant.ttsConfigId == null ? undefined : Number(participant.ttsConfigId),
      sttConfigID: participant.sttConfigId == null
        ? optionalNumber(character?.stt_config_id)
        : Number(participant.sttConfigId),
      position: optionalNumber(participant.position) ?? 0,
    }]
  })
}

export function apiSession(session: import("../generated/eden-agent-rpc").SessionSummary): ApiSession {
  const participants = apiParticipants(session.participants)
  return {
    id: session.id,
    title: session.title,
    runtimeOrigin: session.runtimeOrigin,
    runtimeStatus: "idle",
    ...(session.contextTokens == null ? {} : { contextTokens: Number(session.contextTokens) }),
    ...(session.tokenBreakdown == null ? {} : { tokenBreakdown: apiTokenBreakdown(session.tokenBreakdown) }),
    time: { created: Number(session.createdAt), updated: Number(session.updatedAt) },
    participants,
    participantAssistantIDs: participants.map((participant) => participant.assistantID),
  }
}

function apiTokenBreakdown(value: unknown): import("../types").TokenBreakdown {
  const breakdown = jsonObject(value) ?? {}
  const number = (key: string) => {
    const item = breakdown[key]
    return typeof item === "bigint" ? Number(item) : optionalNumber(item) ?? 0
  }
  return {
    character: number("character"),
    skills: number("skills"),
    system: number("system"),
    tools: number("tools"),
    history: number("history"),
    cacheRead: number("cacheRead"),
    cacheMiss: number("cacheMiss"),
    cacheHitRate: number("cacheHitRate"),
    providerInput: breakdown.providerInput == null ? undefined : number("providerInput"),
    providerOutput: breakdown.providerOutput == null ? undefined : number("providerOutput"),
    providerAdjustment: number("providerAdjustment"),
    contextMeasurement: breakdown.contextMeasurement === "provider" ? "provider" : "estimated",
    promptCacheFingerprint: optionalString(breakdown.promptCacheFingerprint),
    promptCacheEpoch: number("promptCacheEpoch"),
    promptCacheInvalidationReason: optionalString(breakdown.promptCacheInvalidationReason),
    tokenizer: optionalString(breakdown.tokenizer),
    tokenizerModel: optionalString(breakdown.tokenizerModel),
  }
}

function jsonObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined
}

function sessionEventMessage(event: SessionEvent): JsonObject | undefined {
  return jsonObject(jsonObject(event.payload)?.message)
}

export function sessionEventMessageRole(event: SessionEvent): string | undefined {
  return optionalString(sessionEventMessage(event)?.role)
}

export function sessionEventToolResultCallID(event: SessionEvent): string | undefined {
  const message = sessionEventMessage(event)
  return message?.role === "toolResult" ? optionalString(message.toolCallId) : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function optionalTimestamp(value: unknown): number | undefined {
  if (typeof value === "bigint") return Number(value)
  return optionalNumber(value)
}

function optionalID(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined
}

function apiSpeaker(value: unknown): (SessionParticipant & { turnIndex?: number; beatIndex?: number }) | undefined {
  const speaker = jsonObject(value)
  const assistantID = optionalID(speaker?.assistantID)
  if (!speaker || assistantID === undefined) return undefined
  const characterID = optionalID(speaker.characterID)
  const ttsConfigID = optionalNumber(speaker.ttsConfigID)
  return {
    assistantID,
    assistantName: optionalString(speaker.assistantName) ?? "",
    ...(characterID === undefined ? {} : { characterID }),
    ...(optionalString(speaker.characterName) ? { characterName: optionalString(speaker.characterName) } : {}),
    ...(optionalString(speaker.signature) ? { signature: optionalString(speaker.signature) } : {}),
    ...(optionalString(speaker.avatarUrl) ? { avatarUrl: optionalString(speaker.avatarUrl) } : {}),
    ...(optionalString(speaker.standingImageUrl) ? { standingImageUrl: optionalString(speaker.standingImageUrl) } : {}),
    ...(ttsConfigID === undefined ? {} : { ttsConfigID }),
    ...(optionalNumber(speaker.position) === undefined ? {} : { position: optionalNumber(speaker.position) }),
    ...(optionalNumber(speaker.turnIndex) === undefined ? {} : { turnIndex: optionalNumber(speaker.turnIndex) }),
    ...(optionalNumber(speaker.beatIndex) === undefined ? {} : { beatIndex: optionalNumber(speaker.beatIndex) }),
  }
}

function apiDirectorScene(value: unknown): CompanionDirectorScene | undefined {
  const scene = jsonObject(value)
  if (!scene) return undefined
  return {
    domain: optionalString(scene.domain) ?? "",
    interactionType: optionalString(scene.interactionType) ?? "",
    confidence: optionalNumber(scene.confidence) ?? 0,
    summary: optionalString(scene.summary) ?? "",
  }
}

function apiDirectorExecution(value: unknown): CompanionDirectorExecution | undefined {
  const execution = jsonObject(value)
  if (!execution) return undefined
  const leadAssistantID = optionalID(execution.leadAssistantID)
  const toolOwnerAssistantID = optionalID(execution.toolOwnerAssistantID)
  return {
    mode: optionalString(execution.mode) ?? "",
    ...(leadAssistantID === undefined ? {} : { leadAssistantID }),
    ...(toolOwnerAssistantID === undefined ? {} : { toolOwnerAssistantID }),
    observationStrategy: optionalString(execution.observationStrategy) ?? "",
  }
}

type ApiOrchestration = NonNullable<Extract<ApiMessageInfo, { role: "assistant" }>["orchestration"]>

function apiOrchestration(value: unknown): ApiOrchestration | undefined {
  const orchestration = jsonObject(value)
  if (!orchestration) return undefined
  const scene = apiDirectorScene(orchestration.scene)
  const execution = apiDirectorExecution(orchestration.execution)
  const replyToBeat = orchestration.replyToBeat === null ? null : optionalNumber(orchestration.replyToBeat)
  return {
    ...(optionalString(orchestration.planID) ? { planID: optionalString(orchestration.planID) } : {}),
    ...(optionalString(orchestration.directorSource) ? { directorSource: optionalString(orchestration.directorSource) } : {}),
    ...(orchestration.directorDiagnostic === null
      ? { directorDiagnostic: null }
      : optionalString(orchestration.directorDiagnostic)
        ? { directorDiagnostic: optionalString(orchestration.directorDiagnostic) }
        : {}),
    ...(scene ? { scene } : {}),
    ...(execution ? { execution } : {}),
    ...(optionalNumber(orchestration.beatIndex) === undefined ? {} : { beatIndex: optionalNumber(orchestration.beatIndex) }),
    ...(optionalString(orchestration.speechAct) ? { speechAct: optionalString(orchestration.speechAct) } : {}),
    ...(optionalString(orchestration.addressTo) ? { addressTo: optionalString(orchestration.addressTo) } : {}),
    ...(replyToBeat === undefined ? {} : { replyToBeat }),
    ...(optionalString(orchestration.intent) ? { intent: optionalString(orchestration.intent) } : {}),
  }
}

function subagentStatus(value: unknown): SubagentStatus | undefined {
  switch (value) {
    case "queued":
    case "running":
    case "completed":
    case "failed":
    case "interrupted":
      return value
    default:
      return undefined
  }
}

function apiSubagentResult(value: unknown): SubagentResult | null {
  if (value === null || value === undefined) return null
  const result = jsonObject(value)
  if (!result || typeof result.content !== "string") return null
  const artifacts = Array.isArray(result.artifacts)
    ? result.artifacts.flatMap((item) => {
        const record = jsonObject(item)
        return record ? [record] : []
      })
    : []
  const tests = Array.isArray(result.tests)
    ? result.tests.flatMap((item) => {
        const record = jsonObject(item)
        return record ? [record] : []
      })
    : []
  const changedFiles = Array.isArray(result.changedFiles)
    ? result.changedFiles.filter((item): item is string => typeof item === "string")
    : []
  const details = jsonObject(result.details)
  return {
    content: result.content,
    ...(optionalString(result.summary) ? { summary: optionalString(result.summary) } : {}),
    ...(artifacts.length > 0 ? { artifacts } : {}),
    ...(changedFiles.length > 0 ? { changedFiles } : {}),
    ...(tests.length > 0 ? { tests } : {}),
    ...(details ? { details } : {}),
  }
}

export function mapAgentThreadForView(value: unknown): SubagentThread | undefined {
  const agent = jsonObject(value)
  const id = optionalString(agent?.id)
  const rootSessionID = optionalString(agent?.sessionId)
  const agentPath = optionalString(agent?.agentPath)
  const taskName = optionalString(agent?.taskName)
  const role = optionalString(agent?.role)
  const status = subagentStatus(agent?.status)
  const createdAt = optionalTimestamp(agent?.createdAt)
  const updatedAt = optionalTimestamp(agent?.updatedAt)
  if (!agent || !id || !rootSessionID || !agentPath || !taskName || !role || !status || createdAt === undefined || updatedAt === undefined) {
    return undefined
  }
  const config = jsonObject(agent.config)
  const policy = jsonObject(config?.policy)
  const model = jsonObject(config?.model)
  const provider = optionalString(model?.provider)
  const modelID = optionalString(model?.model)
  const coordinationBatchID = optionalString(agent.coordinationBatchId)
  const sandboxMode = optionalString(policy?.sandboxMode)
  const metadata: Record<string, unknown> = {
    ...(coordinationBatchID ? { coordinationBatchID } : {}),
    ...(sandboxMode ? { sandboxMode } : {}),
    ...(provider || modelID ? { model: [provider, modelID].filter(Boolean).join("/") } : {}),
  }
  return {
    id,
    rootSessionID,
    parentID: optionalString(agent.parentId) ?? null,
    agentPath,
    taskName,
    role,
    status,
    depth: agentPath.split("/").filter(Boolean).length - 1,
    createdAt,
    updatedAt,
    startedAt: optionalTimestamp(agent.startedAt) ?? null,
    completedAt: optionalTimestamp(agent.completedAt) ?? null,
    error: optionalString(agent.error) ?? null,
    result: apiSubagentResult(agent.result),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  }
}

function messageParts(
  sessionID: string,
  messageID: string,
  message: JsonObject,
  completedAt?: number,
): ApiPart[] {
  const rawContent = message.content
  const blocks = typeof rawContent === "string"
    ? [{ type: "text", text: rawContent }]
    : Array.isArray(rawContent) ? rawContent.flatMap((block) => {
        const object = jsonObject(block)
        return object ? [object] : []
      }) : []
  return blocks.flatMap((block, index): ApiPart[] => {
    const id = `${messageID}-part-${index}`
    if (block.type === "text") {
      return [{
        id,
        messageID,
        sessionID,
        type: "text",
        text: String(block.text ?? ""),
        ...(completedAt === undefined ? {} : { time: { end: completedAt } }),
      }]
    }
    if (block.type === "thinking") {
      return [{
        id,
        messageID,
        sessionID,
        type: "reasoning",
        text: String(block.thinking ?? ""),
        source: "model",
        ...(completedAt === undefined ? {} : { time: { end: completedAt } }),
      }]
    }
    if (block.type === "image") {
      return [{ id, messageID, sessionID, type: "file", mime: String(block.mimeType ?? "image/png"), url: `data:${String(block.mimeType ?? "image/png")};base64,${String(block.data ?? "")}` }]
    }
    if (block.type === "sticker") {
      const stickerID = Number(block.stickerID ?? block.stickerId)
      const characterID = Number(block.characterID ?? block.characterId)
      const name = optionalString(block.name)
      const url = optionalString(block.url)
      if (!Number.isFinite(stickerID) || !Number.isFinite(characterID) || !name || !url) return []
      return [{
        id,
        messageID,
        sessionID,
        type: "sticker",
        stickerID,
        characterID,
        name,
        url,
        ...(optionalString(block.mime) ? { mime: optionalString(block.mime) } : {}),
        ...(optionalString(block.alt) ? { alt: optionalString(block.alt) } : {}),
      }]
    }
    if (block.type === "toolCall") {
      return [{
        id: String(block.id ?? id), messageID, sessionID, type: "tool", tool: String(block.name ?? "tool"),
        state: { status: "running", input: block.arguments ?? {} },
      }]
    }
    return []
  })
}

function toolResultOutput(message: JsonObject): string {
  const blocks = Array.isArray(message.content) ? message.content : []
  return blocks
    .flatMap((block) => {
      const value = jsonObject(block)
      return value?.type === "text" && typeof value.text === "string" ? [value.text] : []
    })
    .join("\n")
}

function toolResultPart(event: SessionEvent, messageID: string): ApiToolPart | undefined {
  if (event.eventType !== "agent.message_end") return undefined
  const message = sessionEventMessage(event)
  const toolCallID = sessionEventToolResultCallID(event)
  if (!message || !toolCallID) return undefined

  const tool = optionalString(message.toolName) ?? "tool"
  const output = toolResultOutput(message)
  const details = message.details
  const error = jsonObject(message.error)
  const errorCode = optionalString(error?.code)
  const errorMessage = optionalString(error?.message) ?? (output || "Tool execution failed")
  const retryable = typeof error?.retryable === "boolean" ? error.retryable : undefined
  const end = Number(message.timestamp ?? event.createdAt)
  const isError = message.isError === true || message.success === false
  const state: ApiToolState = isError
    ? {
        status: errorCode === "aborted" ? "aborted" : "error",
        error: errorMessage,
        ...(errorCode ? { errorCode } : {}),
        ...(retryable === undefined ? {} : { retryable }),
        ...(details === undefined ? {} : { details }),
        time: { end },
      }
    : {
        status: "completed",
        output,
        ...(details === undefined ? {} : { details }),
        time: { end },
      }
  return { id: toolCallID, messageID, sessionID: event.sessionId, type: "tool", tool, state }
}

export function apiMessage(event: SessionEvent, messageID = event.id): ApiMessage | undefined {
  const payload = event.payload as JsonObject
  const message = payload.message as JsonObject | undefined
  if (message?.display === false || message?.internalHandoff === true) return undefined
  const role = message?.role
  if (role !== "user" && role !== "assistant") return undefined
  const created = Number(message.timestamp ?? event.createdAt)
  const turnID = event.turnId == null ? undefined : String(event.turnId)
  const speaker = apiSpeaker(message.speaker)
  const orchestration = apiOrchestration(message.orchestration)
  const info: ApiMessageInfo = role === "user"
    ? { id: messageID, role, ...(turnID ? { turnID } : {}), time: { created } }
    : {
        id: messageID,
        role,
        ...(turnID ? { turnID } : {}),
        modelID: optionalString(message.model) ?? "",
        providerID: optionalString(message.provider) ?? "",
        ...(speaker ? { speaker } : {}),
        ...(orchestration ? { orchestration } : {}),
        time: { created, completed: event.eventType.endsWith("message_end") ? Number(event.createdAt) : undefined },
        ...(message.errorMessage ? { error: { message: String(message.errorMessage) } } : {}),
      }
  return {
    info,
    parts: messageParts(
      event.sessionId,
      messageID,
      message,
      event.eventType === "agent.message_end" ? Number(event.createdAt) : undefined,
    ),
  }
}

export function mapMemoForView(memo: MemoInfo): JsonObject {
  const iso = (value: bigint | null | undefined) => value == null ? null : new Date(Number(value)).toISOString()
  return {
    id: Number(memo.id), user: 0, title: memo.title, content: memo.content, kind: memo.kind,
    status: memo.status, priority: memo.priority, remind_at: iso(memo.remindAt), due_at: iso(memo.dueAt),
    repeat_rule: memo.repeatRule, source: "edenagent", related_session_id: memo.relatedSessionId,
    related_message_id: "", semantic_task_id: "", last_triggered_at: iso(memo.lastTriggeredAt),
    completed_at: iso(memo.completedAt), metadata: memo.metadata,
    created_at: iso(memo.createdAt), updated_at: iso(memo.updatedAt),
  }
}

export function projectSessionEvent(event: SessionEvent, messageID?: string): JsonObject[] {
  const sessionID = event.sessionId
  const completedTool = messageID ? toolResultPart(event, messageID) : undefined
  if (completedTool) {
    return [{ type: "message.part.updated", properties: { sessionID, part: completedTool } }]
  }
  if (sessionEventMessageRole(event) === "toolResult") return []
  if (event.eventType === "character.action.changed") {
    const value = event.payload as JsonObject
    return [{ type: "character.action.changed", properties: {
      sessionID,
      characterID: value.characterID ?? value.characterId ?? null,
      characterName: value.characterName,
      action: value.action,
      group: value.group ?? null,
      groupItem: value.groupItem ?? null,
      imageUrl: value.imageUrl,
      reason: value.reason,
      source: value.source,
      motion: value.motion,
      effect: value.effect,
      intensity: value.intensity,
      effectAnchor: value.effectAnchor,
      performanceID: value.performanceID,
      time: value.time ?? Number(event.createdAt),
    } }]
  }
  if (event.eventType === "character.sticker.sent") {
    const value = event.payload as JsonObject
    const part = jsonObject(value.part) ?? jsonObject(value.sticker)
    if (!part || !messageID) return []
    const stickerID = Number(part.stickerID ?? part.stickerId ?? part.id)
    const characterID = Number(part.characterID ?? part.characterId ?? part.character)
    const name = optionalString(part.name)
    const url = optionalString(part.url ?? part.imageUrl ?? part.image_url)
    if (!Number.isFinite(stickerID) || !Number.isFinite(characterID) || !name || !url) return []
    return [{ type: "message.part.updated", properties: {
      sessionID,
      part: {
        id: `${event.id}-sticker`,
        messageID,
        sessionID,
        type: "sticker",
        stickerID,
        characterID,
        name,
        url,
        ...(optionalString(part.mime) ? { mime: optionalString(part.mime) } : {}),
        ...(optionalString(part.alt ?? part.description) ? { alt: optionalString(part.alt ?? part.description) } : {}),
      },
    } }]
  }
  if (event.eventType === "session.deleted") {
    return [{ type: "session.deleted", properties: { sessionID } }]
  }
  if (event.eventType === "session.title_updated") {
    const value = event.payload as JsonObject
    return [{ type: "session.title_updated", properties: {
      sessionID,
      title: String(value.title ?? "新会话"),
      titleSource: String(value.titleSource ?? "generated"),
      updatedAt: Number(event.createdAt),
    } }]
  }
  if (event.eventType === "context.usage_updated") {
    const value = event.payload as JsonObject
    const contextTokens = Number(value.contextTokens ?? 0)
    return [{ type: "session.context_usage", properties: {
      sessionID,
      contextTokens: Number.isFinite(contextTokens) ? Math.max(0, contextTokens) : 0,
      tokenBreakdown: apiTokenBreakdown(value.tokenBreakdown),
      phase: value.phase,
      updatedAt: value.updatedAt ?? Number(event.createdAt),
    } }]
  }
  if (event.eventType === "session.participants_updated") {
    const value = event.payload as JsonObject
    return [{ type: "session.participants_updated", properties: {
      sessionID,
      participants: apiParticipants(value.participants),
      updatedAt: Number(event.createdAt),
    } }]
  }
  if (
    event.eventType === "session.assistant_handoff.requested" ||
    event.eventType === "session.assistant_handoff.completed" ||
    event.eventType === "session.assistant_handoff.failed"
  ) {
    const value = event.payload as JsonObject
    const status = event.eventType.endsWith(".requested")
      ? "scheduled"
      : event.eventType.endsWith(".completed")
        ? "completed"
        : "failed"
    const participant = apiParticipants([value.participant])[0]
    const handoff = { type: "session.assistant_handoff", properties: {
      sessionID,
      status,
      jobID: optionalString(value.jobId ?? value.jobID),
      assistantID: optionalID(value.assistantId ?? value.assistantID),
      participant,
      error: optionalString(value.error),
      updatedAt: Number(event.createdAt),
    } }
    if (status !== "failed") return [handoff]
    return [
      handoff,
      { type: "session.error", properties: {
        sessionID,
        error: { message: optionalString(value.error) ?? "助手切换失败" },
      } },
    ]
  }
  if (event.eventType === "turn.started") {
    return [{ type: "session.status", properties: { sessionID, status: { type: "busy" } } }]
  }
  if (event.eventType === "turn.completed" || event.eventType === "input.completed") {
    return [{ type: "session.status", properties: { sessionID, status: { type: "idle" } } }]
  }
  if (
    event.eventType === "companion.director.started" ||
    event.eventType === "companion.plan" ||
    event.eventType === "companion.speaker.started" ||
    event.eventType === "companion.speaker.finished" ||
    event.eventType === "companion.director.completed" ||
    event.eventType === "companion.director.failed"
  ) {
    return [{ type: event.eventType, properties: event.payload as JsonObject }]
  }
  if (event.eventType === "turn.failed" || event.eventType === "input.interrupted") {
    return [
      { type: "session.error", properties: { sessionID, error: { message: String((event.payload as JsonObject).reason ?? "Turn failed") } } },
      { type: "session.status", properties: { sessionID, status: { type: "idle" } } },
    ]
  }
  if (event.eventType === "agent.stream_reset") {
    return [{
      type: "message.stream_reset",
      properties: {
        sessionID,
        messageID: messageID ?? event.id,
        reason: String((event.payload as JsonObject).reason ?? "Model stream restarted"),
      },
    }]
  }
  if (event.eventType.startsWith("agent.message_")) {
    const message = apiMessage(event, messageID)
    if (!message) return []
    return [
      { type: "message.updated", properties: { sessionID, info: message.info } },
      ...message.parts.map((part) => ({ type: "message.part.updated", properties: { sessionID, part } })),
    ]
  }
  if (event.eventType === "permission.requested") {
    const value = event.payload as JsonObject
    return [{ type: "permission.asked", properties: {
      id: value.id,
      sessionID,
      permission: value.capability,
      patterns: [String(value.resource ?? "")],
      metadata: value.request ?? {},
      always: [String(value.resource ?? "")],
    } }]
  }
  if (event.eventType === "permission.resolved") {
    return [{ type: "permission.replied", properties: {
      sessionID, requestID: (event.payload as JsonObject).requestId, reply: "once",
    } }]
  }
  if (event.eventType === "question.requested") {
    const value = event.payload as JsonObject
    return [{ type: "question.asked", properties: {
      id: value.id, sessionID, questions: value.questions,
    } }]
  }
  if (event.eventType === "question.resolved") {
    const value = event.payload as JsonObject
    return [{ type: "question.replied", properties: {
      sessionID, requestID: value.requestId, answers: value.answers,
    } }]
  }
  if (event.eventType === "media.requested") {
    const value = event.payload as JsonObject
    const request = (value.request ?? {}) as JsonObject
    return [{ type: value.kind === "camera" ? "camera_capture.requested" : "screen_capture.requested",
      properties: { id: value.id, sessionID, ...request } }]
  }
  if (event.eventType === "media.resolved") {
    const value = event.payload as JsonObject
    return [{ type: value.kind === "camera" ? "camera_capture.replied" : "screen_capture.replied",
      properties: { requestID: value.id, sessionID, result: value.result, error: value.error } }]
  }
  if (event.eventType.startsWith("subagent.") && !(event.eventType.startsWith("subagent.agent_"))) {
    const agent = mapAgentThreadForView(jsonObject(event.payload)?.agent)
    if (!agent) return []
    return [{ type: event.eventType, properties: {
      sessionID,
      agent,
    } }]
  }
  return []
}
