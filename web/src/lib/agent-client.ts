import { rpcRequestForOrigin } from './rpc-transport'
import type { ToolInfo } from '@eden/api'
import type { DirectorRun as DirectorRunInfo } from '@eden/api'
import type { AgentThreadInfo } from '@eden/api'
import type { SelfAwakeRunInfo } from '@eden/api'
import type { MarketReleaseInfo as PluginMarketReleaseInfo, MarketSourceInfo as PluginMarketSourceInfo } from '@eden/api'
import { packagePermissionSetSchema } from '@eden/api'
import type { ManagedPluginInfo as PluginInfo } from '@eden/api'
import { mediaResolveSchema } from '@eden/api'
import type { SessionEventInput as RpcSessionEvent } from './session-event'
import { memoCreateSchema, memoPatchSchema } from '@eden/api'
import type { ConnectorCapabilityInfo as RpcConnectorCapabilityInfo, ConnectorCatalogEntry as RpcConnectorCatalogEntry, ConnectorInfo as RpcConnectorInfo } from '@eden/api'
import { buildSessionEnvironment } from "./session-environment"
import { getRuntimeModelConfig } from "./runtime-model-client"
export { getRuntimeModelConfig, updateRuntimeModel } from "./runtime-model-client"
export type { RuntimeModelConfig, RuntimeModelOption, ModelSelectionTarget } from "./runtime-models"
import type {
  CompanionDirectorBeat,
  CompanionDirectorExecution,
  CompanionDirectorRun,
  CompanionDirectorScene,
  MessageData,
  PendingPermission,
  PendingQuestion,
  PermissionMode,
  PromptAttachment,
  Session,
  ToolCall,
} from "../types"
import { getStoredUser, resolveCoreAssetUrl } from "./auth"
import type { CoreCharacterVisualAction, CoreCharacterVisualActionGroup } from "./auth"
import { formatLocalTime } from "./time"
import type {
  JsonValue,
} from "../generated/eden-agent-rpc"
import { getStoredRuntimeOrigin, LOCAL_ASSISTANT_ID } from "./runtime-origin"
import { captureParticipantIdentity, resolveParticipants } from "./session-participants"
import {
  type LocalGsvConfig,
  type LocalGsvDiscovery,
  type LocalGsvPreview,
  type LocalGsvSttConfig,
} from "./desktop-window"
import {
  agentHttpBaseUrl, apiMessage, apiSession, mapMemoForView, projectSessionEvent,
  mapAgentThreadForView, rpcRequest, rpcRequestWithTimeout, sessionEventMessageID, sessionEventMessageRole,
  resolveVoiceBlobUrl, sessionEventToolResultCallID, subscribeRpcEvents, uploadAttachments,
} from "./rpc-transport"

export type SessionParticipant = {
  assistantID: number | string
  assistantName: string
  characterID?: number | string | null
  characterName?: string
  signature?: string
  avatarUrl?: string
  standingImageUrl?: string
  ttsConfigID?: number | null
  sttConfigID?: number | null
  position?: number
}

export type ApiSession = {
  id: string
  title: string
  runtimeOrigin?: "mon" | "local"
  runtimeStatus?: import("../types").SessionStatus
  contextTokens?: number
  tokenBreakdown?: import("../types").TokenBreakdown
  mode?: "companion" | "solo"
  directorPolicy?: Record<string, unknown>
  participants?: SessionParticipant[]
  participantAssistantIDs?: Array<number | string>
  directorRuns?: CompanionDirectorRun[]
  agentThreads?: import("../types").SubagentThread[]
  agentMessages?: Array<Record<string, unknown>>
  time: {
    updated: number
    created: number
  }
}

export type ToolStatus = {
  search: {
    status: "online" | "offline" | "starting"
    provider?: string
    mode?: "embedded" | "disabled"
    label?: string
    endpoint?: string
    latencyMs?: number
    message?: string
  }
  tools: Record<string, string>
  toolDetails?: Record<string, ToolDefinition>
}

export type ToolDefinition = {
  name: string
  label: string
  description: string
  parameters: Record<string, unknown>
  source?: string
  namespace?: string
  exposure?: "direct" | "deferred" | "hidden"
  capabilities?: string[]
  requiresPermission?: boolean
  executionMode?: string | null
}

export type Connector = RpcConnectorInfo

export type ConnectorCapability = RpcConnectorCapabilityInfo
export type ConnectorCatalogEntry = RpcConnectorCatalogEntry
export type Plugin = PluginInfo
export type PluginMarketRelease = PluginMarketReleaseInfo
export type PluginMarketSource = PluginMarketSourceInfo

export function listPlugins() {
  return rpcRequest("plugin.list", {})
}

export function inspectPlugin(sourceUri: string) {
  return rpcRequest("plugin.inspect", { sourceType: "local", sourceUri })
}

export function installPlugin(previewID: string) {
  return rpcRequest("plugin.install_preview", {
    previewID,
    activate: true,
    enabled: false,
    requireVerified: false,
  })
}

export function enablePlugin(id: string, enabled: boolean) {
  return rpcRequest("plugin.enable", { id, enabled })
}

export function setPluginPermissions(
  id: string,
  revision: string,
  decisions: Array<{ capability: string; resource: string; access: string; decision: string }>,
) {
  return rpcRequest("plugin.permissions.set", packagePermissionSetSchema.parse({ id, revision, decisions }))
}

export function uninstallPlugin(id: string) {
  return rpcRequest("plugin.uninstall", { id })
}

export function listPluginMarketSources() {
  return rpcRequest("plugin.market.source.list", {})
}

export function addPluginMarketSource(input: {
  id: string
  name: string
  url: string
  keyID: string
  enabled?: boolean
}) {
  return rpcRequest("plugin.market.source.add", { ...input, enabled: input.enabled ?? true })
}

export function removePluginMarketSource(id: string) {
  return rpcRequest("plugin.market.source.remove", { id })
}

export function refreshPluginMarketSource(id: string) {
  return rpcRequest("plugin.market.source.refresh", { id })
}

export function listPluginMarketReleases(sourceID?: string) {
  return rpcRequest("plugin.market.list", sourceID ? { sourceID } : {})
}

export function inspectPluginMarketRelease(sourceID: string, pluginID: string, version: string) {
  return rpcRequest("plugin.market.inspect", { sourceID, pluginID, version })
}

export async function listConnectors() {
  return rpcRequest("connector.list", {})
}

export async function listConnectorCatalog() {
  return rpcRequest("connector.catalog", {})
}

export function createConnector(input: { connectorKey: string; identityKey: string; desiredState?: "connected" | "disconnected"; settings?: unknown }) {
  return rpcRequest("connector.create", {
    connectorKey: input.connectorKey, identityKey: input.identityKey, displayName: input.identityKey,
    desiredState: input.desiredState ?? "disconnected", settings: (input.settings ?? {}) as JsonValue,
  })
}

export function updateConnector(id: string, input: Partial<Pick<Connector, "desiredState" | "settings" | "displayName">>) {
  return rpcRequest("connector.update", { id: String(id), patch: ({
    ...(input.desiredState ? { desiredState: input.desiredState } : {}),
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.settings !== undefined ? { settings: input.settings } : {}),
  }) })
}

export type WorkspaceEntry = {
  name: string
  path: string
  type: "directory" | "file"
  size?: number | null
}

export type WorkspaceDirectory = {
  root: string
  path: string
  entries: WorkspaceEntry[]
}

export type WorkspaceFileContent = {
  name: string
  path: string
  size: number
  binary: boolean
  truncated: boolean
  content: string
}

export type ApiSelfAwakeDiary = {
  id: string
  run: string
  title: string
  content: string
  summary?: string
  tags?: string[] | null
  importance?: string
  continuity_key?: string
  visible_to_user: boolean
  created_at?: string
  updated_at?: string
}

export type ApiSelfAwakeAction = {
  id: string
  run: string
  action_type: string
  message: string
  payload?: Record<string, unknown> | null
  status: string
  error: string
  created_at?: string
  updated_at?: string
}

export type ApiSelfAwakeRun = {
  id: string
  assistant?: number | string | null
  character?: number | string | null
  author?: {
    assistant_id?: number | string | null
    assistant_name: string
    character_id?: number | string | null
    character_name: string
    avatar_url?: string
  }
  source_service: string
  external_run_id: string
  event_type: string
  event_source: string
  event_reason: string
  event_id: string
  event_occurred_at?: string | null
  status: string
  started_at?: string
  finished_at?: string | null
  context_payload?: Record<string, unknown> | null
  decision_payload?: Record<string, unknown> | null
  mood: string
  current_desire: string
  should_interrupt_user: boolean
  next_wake_at?: string | null
  next_wake_after_minutes?: number | null
  next_wake_reason: string
  error: string
  created_at?: string
  updated_at?: string
  diaries?: ApiSelfAwakeDiary[]
  actions?: ApiSelfAwakeAction[]
}

export type ApiPaginatedResult<T> = {
  count: number
  next?: string | null
  previous?: string | null
  page_size: number
  current_page: number
  total_pages: number
  results: T[]
}

export type ApiMemoKind = "note" | "reminder" | "todo"
export type ApiMemoStatus = "active" | "done" | "archived" | "cancelled"
export type ApiMemoPriority = "low" | "normal" | "high"

export type ApiMemo = {
  id: number
  user: number
  title: string
  content: string
  kind: ApiMemoKind
  status: ApiMemoStatus
  priority: ApiMemoPriority
  remind_at?: string | null
  due_at?: string | null
  repeat_rule: string
  source: string
  related_session_id: string
  related_message_id: string
  semantic_task_id: string
  last_triggered_at?: string | null
  snoozed_until?: string | null
  completed_at?: string | null
  metadata?: Record<string, unknown>
  trigger_at?: string | null
  created_at?: string
  updated_at?: string
}

export type ApiMemoInput = {
  title: string
  content?: string
  kind?: ApiMemoKind
  status?: ApiMemoStatus
  priority?: ApiMemoPriority
  remind_at?: string | null
  due_at?: string | null
  repeat_rule?: string
  metadata?: Record<string, unknown>
}

export type ApiMessageInfo =
  | {
      id: string
      role: "user"
      turnID?: string
      time: {
        created: number
      }
    }
  | {
      id: string
      role: "assistant"
      turnID?: string
      kind?: string
      time: {
        created: number
        completed?: number
      }
      agent?: string
      runID?: string
      modelID?: string
      providerID?: string
      completionState?: "provisional" | "final"
      coordinationBatchID?: string | null
      speaker?: SessionParticipant & { turnIndex?: number; beatIndex?: number }
      orchestration?: {
        planID?: string
        directorSource?: string
        directorDiagnostic?: string | null
        scene?: CompanionDirectorScene
        execution?: CompanionDirectorExecution
        beatIndex?: number
        speechAct?: string
        addressTo?: string
        replyToBeat?: number | null
        intent?: string
      }
      error?: {
        name?: string
        message?: string
        data?: {
          message?: string
          code?: string
          path?: string
          status?: number
        }
      } | null
    }

export type ApiTextPart = {
  id: string
  messageID: string
  sessionID: string
  type: "text"
  text: string
  time?: {
    start?: number
    end?: number
  }
}

export type ApiReasoningPart = {
  id: string
  messageID: string
  sessionID: string
  type: "reasoning"
  text: string
  source?: "runtime" | "model"
  title?: string
  time?: {
    start?: number
    end?: number
  }
}

export type ApiFilePart = {
  id: string
  messageID: string
  sessionID: string
  type: "file"
  mime: string
  url: string
  filename?: string
}

export type ApiStickerPart = {
  id: string
  messageID: string
  sessionID: string
  type: "sticker"
  stickerID: number
  characterID: number
  name: string
  url: string
  mime?: string
  alt?: string
}

export type ApiSnapshotPart = {
  id: string
  messageID: string
  sessionID: string
  type: "snapshot"
  snapshot: string
}

export type ApiPatchPart = {
  id: string
  messageID: string
  sessionID: string
  type: "patch"
  hash: string
  files: string[]
}

export type ApiAgentPart = {
  id: string
  messageID: string
  sessionID: string
  type: "agent"
  name: string
  source?: {
    value: string
    start: number
    end: number
  }
}

export type ApiCompactionPart = {
  id: string
  messageID: string
  sessionID: string
  type: "compaction"
  auto: boolean
  overflow?: boolean
  tail_start_id?: string
  firstKeptEntryId?: string
  summary?: string
  details?: unknown
  tokensBefore?: number
  tokensAfter?: number
}

export type ApiSubtaskPart = {
  id: string
  messageID: string
  sessionID: string
  type: "subtask"
  prompt: string
  description: string
  agent: string
  model?: {
    providerID: string
    modelID: string
  }
  command?: string
}

export type ApiRetryPart = {
  id: string
  messageID: string
  sessionID: string
  type: "retry"
  attempt: number
  error: {
    message?: string
    statusCode?: number
    isRetryable?: boolean
  }
  time: {
    created: number
  }
}

export type ApiStepStartPart = {
  id: string
  messageID: string
  sessionID: string
  type: "step-start"
  snapshot?: string
}

export type ApiStepFinishPart = {
  id: string
  messageID: string
  sessionID: string
  type: "step-finish"
  reason: string
  snapshot?: string
  cost: number
  tokens: {
    total?: number
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
}

export type ApiToolState =
  | { status: "pending" | "running"; input?: unknown; output?: string; details?: unknown; time?: { start?: number; end?: number } }
  | { status: "completed"; input?: unknown; output: string; details?: unknown; time?: { start?: number; end?: number } }
  | {
      status: "error" | "aborted"
      input?: unknown
      error: string
      errorCode?: string
      retryable?: boolean
      details?: unknown
      time?: { start?: number; end?: number }
    }

export type ApiToolPart = {
  id: string
  messageID: string
  sessionID: string
  type: "tool"
  tool: string
  state: ApiToolState
}

export type ApiUnknownPart = {
  id: string
  messageID: string
  sessionID: string
  type: string
  [key: string]: unknown
}

export type ApiPart =
  | ApiTextPart
  | ApiReasoningPart
  | ApiFilePart
  | ApiStickerPart
  | ApiSnapshotPart
  | ApiPatchPart
  | ApiAgentPart
  | ApiCompactionPart
  | ApiSubtaskPart
  | ApiRetryPart
  | ApiStepStartPart
  | ApiStepFinishPart
  | ApiToolPart
  | ApiUnknownPart

export type ApiMessage = {
  info: ApiMessageInfo
  parts: ApiPart[]
}

export type SessionCreatedEvent = {
  type: "session.created" | "session.updated"
  properties: {
    sessionID: string
    info: ApiSession
  }
}

export type SessionStatusEvent = {
  type: "session.status"
  properties: {
    sessionID: string
    status: {
      type?: "idle" | "busy" | "retry" | string
      [key: string]: unknown
    }
  }
}

export type CompanionDirectorStartedEvent = {
  type: "companion.director.started"
  properties: {
    sessionID: string
    participantCount: number
    userMessageID?: string
  }
}

export type CompanionPlanEvent = {
  type: "companion.plan"
  properties: {
    sessionID: string
    planID: string
    userMessageID: string
    source: string
    diagnostic?: string | null
    scene?: CompanionDirectorScene
    execution?: CompanionDirectorExecution
    beats: CompanionDirectorBeat[]
  }
}

export type CompanionSpeakerEvent = {
  type: "companion.speaker.started" | "companion.speaker.finished"
  properties: {
    sessionID: string
    planID: string
    beatIndex: number
    speaker: SessionParticipant & { turnIndex?: number; beatIndex?: number }
    beat?: CompanionDirectorBeat
  }
}

export type SessionErrorEvent = {
  type: "session.error"
  properties: {
    sessionID?: string
    error?: {
      name?: string
      message?: string
      data?: {
        message?: string
        code?: string
        path?: string
        status?: number
      }
    }
  }
}

export type PermissionAskedEvent = {
  type: "permission.asked"
  properties: PendingPermission
}

export type PermissionRepliedEvent = {
  type: "permission.replied"
  properties: {
    sessionID: string
    requestID: string
    reply: "once" | "always" | "reject"
  }
}

export type PermissionModeEvent = {
  type: "permission.mode"
  properties: {
    mode: PermissionMode
  }
}

export type QuestionAskedEvent = {
  type: "question.asked"
  properties: PendingQuestion
}

export type QuestionRepliedEvent = {
  type: "question.replied"
  properties: {
    sessionID: string
    requestID: string
    answers: string[][]
  }
}

export type QuestionRejectedEvent = {
  type: "question.rejected"
  properties: {
    sessionID: string
    requestID: string
  }
}

export interface PendingScreenCapture {
  id: string
  sessionID?: string
  toolCallID?: string
  display?: "cursor" | "primary" | string
  source?: "auto" | "desktop" | "game"
}

export interface PendingCameraCapture {
  id: string
  sessionID?: string
  toolCallID?: string
  facingMode?: "user" | "environment" | string
}

export type ScreenCaptureRequestedEvent = {
  type: "screen_capture.requested"
  properties: PendingScreenCapture
}

export type CameraCaptureRequestedEvent = {
  type: "camera_capture.requested"
  properties: PendingCameraCapture
}

export type CameraCaptureRepliedEvent = {
  type: "camera_capture.replied"
  properties: {
    sessionID?: string
    requestID: string
    success: boolean
    error?: string | null
  }
}

export type ScreenCaptureRepliedEvent = {
  type: "screen_capture.replied"
  properties: {
    sessionID?: string
    requestID: string
    success: boolean
    error?: string | null
  }
}

export type MessageUpdatedEvent = {
  type: "message.updated"
  properties: {
    sessionID: string
    info: ApiMessageInfo
  }
}

export type MessagePartUpdatedEvent = {
  type: "message.part.updated"
  properties: {
    sessionID: string
    part: ApiPart
    time?: number
  }
}

export type MessagePartDeltaEvent = {
  type: "message.part.delta"
  properties: {
    sessionID: string
    messageID: string
    partID: string
    field: string
    delta: string
    baseLength?: number
    targetText?: string
    partType?: "text" | "reasoning"
    source?: "runtime" | "model"
    title?: string
    time?: {
      start?: number
      end?: number
    }
  }
}

export type MessagePartRemovedEvent = {
  type: "message.part.removed"
  properties: {
    sessionID: string
    messageID: string
    partID: string
  }
}

export type SessionParticipantsUpdatedEvent = {
  type: "session.participants_updated"
  properties: {
    sessionID: string
    participants: SessionParticipant[]
    updatedAt?: number
  }
}

export type SessionAssistantHandoffEvent = {
  type: "session.assistant_handoff"
  properties: {
    sessionID: string
    status: "scheduled" | "completed" | "failed"
    jobID?: string
    assistantID?: number | string
    participant?: SessionParticipant
    error?: string
    updatedAt?: number
  }
}

export type CompanionDirectorFinishedEvent = {
  type: "companion.director.completed" | "companion.director.failed"
  properties: {
    sessionID: string
    planID: string
    status: "completed" | "failed"
    completedBeatIndexes?: number[]
    error?: string
  }
}

export type MessageStreamResetEvent = {
  type: "message.stream_reset"
  properties: {
    sessionID: string
    messageID: string
    reason: string
  }
}

export type CharacterActionChangedEvent = {
  type: "character.action.changed"
  properties: {
    sessionID?: string
    characterID?: number | string | null
    characterName?: string
    action?: CoreCharacterVisualAction
    group?: CoreCharacterVisualActionGroup | null
    imageUrl?: string
    reason?: string
    source?: string
    motion?: "none" | "jump" | "approach" | "retreat" | "shake" | "bounce" | "float" | "tremble" | "vertical_shake" | "sink" | "emphasize" | string
    effect?: "none" | "question" | "exclamation" | "sweat" | "heart" | "anger" | "sigh" | "speechless" | "gloomy" | "sleepy" | string
    intensity?: "light" | "normal" | "strong" | string
    effectAnchor?: "head_left" | "head_right" | "above" | "body_left" | "body_right" | string
    performanceID?: string
    time?: number
  }
}

export type ApiEvent =
  | SessionCreatedEvent
  | SessionStatusEvent
  | SessionParticipantsUpdatedEvent
  | SessionAssistantHandoffEvent
  | CompanionDirectorStartedEvent
  | CompanionPlanEvent
  | CompanionSpeakerEvent
  | CompanionDirectorFinishedEvent
  | SessionErrorEvent
  | PermissionAskedEvent
  | PermissionRepliedEvent
  | PermissionModeEvent
  | QuestionAskedEvent
  | QuestionRepliedEvent
  | QuestionRejectedEvent
  | ScreenCaptureRequestedEvent
  | ScreenCaptureRepliedEvent
  | CameraCaptureRequestedEvent
  | CameraCaptureRepliedEvent
  | MessageUpdatedEvent
  | MessagePartUpdatedEvent
  | MessagePartDeltaEvent
  | MessagePartRemovedEvent
  | MessageStreamResetEvent
  | CharacterActionChangedEvent
  | {
      type: string
      properties?: {
        sessionID?: string
        [key: string]: unknown
      }
    }


type SubscribeHandlers = {
  onEvent: (event: ApiEvent) => void
  onOpen?: () => void
  onError?: (error: string) => void
}

export function isApiTextPart(part: ApiPart): part is ApiTextPart {
  return part.type === "text" && typeof (part as { text?: unknown }).text === "string"
}

export function isApiReasoningPart(part: ApiPart): part is ApiReasoningPart {
  return part.type === "reasoning" && typeof (part as { text?: unknown }).text === "string"
}

export function isApiFilePart(part: ApiPart): part is ApiFilePart {
  return (
    part.type === "file" &&
    typeof (part as { mime?: unknown; url?: unknown }).mime === "string" &&
    typeof (part as { url?: unknown }).url === "string"
  )
}

export function isApiStickerPart(part: ApiPart): part is ApiStickerPart {
  return (
    part.type === "sticker" &&
    typeof (part as { url?: unknown }).url === "string" &&
    typeof (part as { name?: unknown }).name === "string"
  )
}

export function isApiToolPart(part: ApiPart): part is ApiToolPart {
  return (
    part.type === "tool" &&
    typeof (part as { tool?: unknown }).tool === "string" &&
    typeof (part as { state?: unknown }).state === "object"
  )
}

export function isApiSnapshotPart(part: ApiPart): part is ApiSnapshotPart {
  return part.type === "snapshot" && typeof (part as { snapshot?: unknown }).snapshot === "string"
}

export function isApiPatchPart(part: ApiPart): part is ApiPatchPart {
  return (
    part.type === "patch" &&
    typeof (part as { hash?: unknown }).hash === "string" &&
    Array.isArray((part as { files?: unknown }).files)
  )
}

export function isApiAgentPart(part: ApiPart): part is ApiAgentPart {
  return part.type === "agent" && typeof (part as { name?: unknown }).name === "string"
}

export function isApiCompactionPart(part: ApiPart): part is ApiCompactionPart {
  return part.type === "compaction" && typeof (part as { auto?: unknown }).auto === "boolean"
}

export function isApiSubtaskPart(part: ApiPart): part is ApiSubtaskPart {
  return (
    part.type === "subtask" &&
    typeof (part as { prompt?: unknown }).prompt === "string" &&
    typeof (part as { description?: unknown }).description === "string" &&
    typeof (part as { agent?: unknown }).agent === "string"
  )
}

export function isApiRetryPart(part: ApiPart): part is ApiRetryPart {
  return (
    part.type === "retry" &&
    typeof (part as { attempt?: unknown }).attempt === "number" &&
    typeof (part as { error?: unknown }).error === "object"
  )
}

export function isApiStepStartPart(part: ApiPart): part is ApiStepStartPart {
  return part.type === "step-start"
}

export function isApiStepFinishPart(part: ApiPart): part is ApiStepFinishPart {
  return (
    part.type === "step-finish" &&
    typeof (part as { reason?: unknown }).reason === "string" &&
    typeof (part as { cost?: unknown }).cost === "number"
  )
}

export function isCoreAuthExpiredEvent(event: ApiEvent) {
  if (event.type !== "session.error") return false
  const properties = event.properties as SessionErrorEvent["properties"] | undefined
  const error = properties?.error
  const text = `${error?.name ?? ""} ${error?.message ?? ""} ${error?.data?.message ?? ""} ${error?.data?.code ?? ""}`
  return (
    error?.name === "CoreAuthenticationExpired" ||
    error?.data?.code === "core_authentication_expired" ||
    /authentication_expired|not_authenticated/i.test(text)
  )
}

export { listSkills, getSkillDetails, inspectSkill, installSkill, setSkillEnabled, uninstallSkill } from "./skill-client"
export type { InstalledSkill, SkillDetails, SkillPreview } from "./skill-client"

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

export function resolveEdenAgentUrl(url: string) {
  if (!url) return url
  if (/^(data:|blob:|https?:\/\/)/i.test(url)) return url
  if (url.startsWith("file://")) {
    if (!window.edenAgentDesktop?.convertFileSrc) return url

    try {
      const fileUrl = new URL(url)
      const pathname = decodeURIComponent(fileUrl.pathname)
      const filePath = pathname.replace(/^\/([A-Za-z]:\/)/, "$1").replace(/\//g, "\\")
      return window.edenAgentDesktop.convertFileSrc(filePath)
    } catch {
      return url
    }
  }
  if (url.startsWith("/api/")) return resolveCoreAssetUrl(url) ?? url
  if (url.startsWith("/")) return `${agentHttpBaseUrl()}${url}`
  return url
}

function mapTool(part: ApiToolPart): ToolCall {
  const state = part.state
  const status = state.status === "completed" ? "success" : state.status === "aborted" ? "aborted" : state.status === "error" ? "error" : "running"
  const time = state.time
  const start = time?.start
  const end = time?.end

  return {
    id: part.id,
    name: part.tool,
    status,
    input: stringify("input" in state ? state.input : {}),
    output: "output" in state ? state.output : undefined,
    error: state.status === "error" || state.status === "aborted" ? state.error : undefined,
    errorCode: state.status === "error" || state.status === "aborted" ? state.errorCode : undefined,
    retryable: state.status === "error" || state.status === "aborted" ? state.retryable : undefined,
    details: state.details,
    duration: start && end ? end - start : undefined,
  }
}

export function mapSession(info: ApiSession, messages: MessageData[] = []): Session {
  return {
    id: info.id,
    title: info.title || "新会话",
    updatedAt: info.time.updated,
    contextTokens: info.contextTokens,
    tokenBreakdown: info.tokenBreakdown,
    date: timeLabel(info.time.updated),
    messages,
  }
}

export function mapMessage(input: ApiMessage): MessageData {
  const text = input.parts
    .filter(
      (part): part is ApiTextPart => isApiTextPart(part) && !(part as ApiTextPart & { synthetic?: boolean }).synthetic,
    )
    .map((part) => part.text)
    .join("\n")
    .trim()
  const reasoningParts = input.parts.filter(isApiReasoningPart)
  const runtimeTrace = reasoningParts
    .filter((part) => part.source === "runtime" || part.id.endsWith("_runtime_thinking"))
    .map((part) => part.text)
    .join("\n")
    .trim()
  const reasoning = reasoningParts
    .filter((part) => part.source !== "runtime" && !part.id.endsWith("_runtime_thinking"))
    .map((part) => part.text)
    .join("\n")
    .trim()
  const images = input.parts
    .filter((part): part is ApiFilePart => isApiFilePart(part) && part.mime.startsWith("image/"))
    .map((part) => part.url)
  const files = input.parts.filter((part): part is ApiFilePart => isApiFilePart(part) && !part.mime.startsWith("image/"))
    .map(part => ({ url: part.url, mime: part.mime, filename: part.filename }))
  const toolCalls = input.parts.filter(isApiToolPart).map(mapTool)

  return {
    id: input.info.id,
    role: input.info.role,
    content: text,
    timestamp: timeLabel(input.info.time.created),
    runtimeTrace: runtimeTrace || undefined,
    thinking: reasoning || undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    images: images.length ? images : undefined,
    files: files.length ? files : undefined,
  }
}

export async function isBackgroundSession(sessionId: string): Promise<boolean> {
  try {
    await rpcRequest("session.read", { sessionId })
    return false
  } catch (error) {
    if (error instanceof Error && error.message.includes("background_session:")) return true
    // Missing rows and transient connection errors must not erase cached chats.
    return false
  }
}

export async function listSessionsRaw() {
  return (await rpcRequest("session.list", { limit: 50, includeClosed: false })).map(apiSession)
}

export async function listSessions() {
  const sessions = await listSessionsRaw()
  return sessions.map((session) => mapSession(session))
}

export async function createSessionRaw(
  assistantIDs: Array<number | string> = [],
  initialPrompt?: { content: string; attachments: Array<PromptAttachment | string> },
) {
  const identity = captureParticipantIdentity()
  const { origin } = identity
  const participantIDs = origin === "local" && assistantIDs.length === 0
    ? [LOCAL_ASSISTANT_ID]
    : assistantIDs
  const participants = await resolveParticipants(participantIDs, identity)
  identity.assertCurrent()
  const environment = currentSessionEnvironment()
  const session = await rpcRequestForOrigin(origin, "session.create", { title: "", participants, environment })
  identity.assertCurrent()
  await getRuntimeModelConfig(session.id, origin).catch((error) => {
    console.warn(`[Model] session ${session.id} could not hydrate its Core model binding`, error)
  })
  if (initialPrompt) {
    identity.assertCurrent()
    const attachments = await uploadAttachments(initialPrompt.attachments)
    identity.assertCurrent()
    await rpcRequestForOrigin(origin, "turn.start", { sessionId: session.id, text: initialPrompt.content,
      attachments, environment })
  }
  identity.assertCurrent()
  return apiSession(session)
}

export async function updateSessionParticipants(sessionID: string, assistantIDs: Array<number | string>) {
  const identity = captureParticipantIdentity()
  const { origin } = identity
  const participants = await resolveParticipants(assistantIDs, identity)
  identity.assertCurrent()
  const session = apiSession(await rpcRequestForOrigin(origin, "session.set_participants", { sessionId: sessionID, participants }))
  identity.assertCurrent()
  await getRuntimeModelConfig(sessionID, origin)
  identity.assertCurrent()
  return session
}


function currentSessionEnvironment() {
  return buildSessionEnvironment(getStoredUser()?.environment, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language)
}

export async function deleteSession(sessionID: string) {
  const result = await rpcRequest("session.delete", { sessionId: sessionID })
  return { deleted: result.deleted, sessionID: result.sessionId }
}

export async function createSession() {
  const session = await createSessionRaw()
  return mapSession(session)
}

export interface MessagePage {
  items: ApiMessage[]
  hasMore: boolean
  nextCursor?: string | null
  directorRuns?: CompanionDirectorRun[]
}

function upsertProjectedPart(message: ApiMessage, part: ApiPart) {
  const index = message.parts.findIndex((candidate) => candidate.id === part.id)
  if (index < 0) {
    message.parts.push(part)
    return
  }
  const existing = message.parts[index]
  if (isApiToolPart(existing) && isApiToolPart(part)) {
    const input = part.state.input === undefined ? existing.state.input : part.state.input
    const time = { ...existing.state.time, ...part.state.time }
    message.parts[index] = {
      ...existing,
      ...part,
      state: { ...existing.state, ...part.state, input, time } as ApiToolState,
    }
    return
  }
  message.parts[index] = part
}

function applyProjectedParts(event: RpcSessionEvent, message: ApiMessage) {
  for (const update of projectSessionEvent(event, message.info.id)) {
    const part = (update.properties as { part?: ApiPart } | undefined)?.part
    if (update.type === "message.part.updated" && part) upsertProjectedPart(message, part)
  }
}

export function projectMessageEvents(events: RpcSessionEvent[]): ApiMessage[] {
  const items: ApiMessage[] = []
  const latestByTurn = new Map<string, ApiMessage>()
  const pendingByTurn = new Map<string, RpcSessionEvent[]>()
  const toolOwners = new Map<string, ApiMessage>()

  for (const event of events) {
    const turnKey = String(event.turnId ?? "none")
    const toolCallID = sessionEventToolResultCallID(event)
    if (toolCallID) {
      const ownerKey = `${turnKey}:${toolCallID}`
      const owner = toolOwners.get(ownerKey)
      if (owner) applyProjectedParts(event, owner)
      if (event.eventType === "agent.message_end") toolOwners.delete(ownerKey)
      continue
    }

    const message = apiMessage(event)
    if (message) {
      items.push(message)
      latestByTurn.set(turnKey, message)
      for (const part of message.parts) {
        if (isApiToolPart(part)) toolOwners.set(`${turnKey}:${part.id}`, message)
      }
      const pending = pendingByTurn.get(turnKey) ?? []
      for (const companion of pending) applyProjectedParts(companion, message)
      pendingByTurn.delete(turnKey)
      continue
    }

    if (event.eventType !== "character.sticker.sent") continue
    const latest = latestByTurn.get(turnKey)
    if (latest) {
      applyProjectedParts(event, latest)
    } else {
      const pending = pendingByTurn.get(turnKey) ?? []
      pending.push(event)
      pendingByTurn.set(turnKey, pending)
    }
  }
  return items
}

export async function renameSession(sessionID: string, title: string) {
  const session = await rpcRequest("session.rename", { sessionId: sessionID, title })
  return apiSession(session)
}

export async function listMessagesRaw(sessionID: string, before?: string, limit = 50) {
  const [page, directorRuns] = await Promise.all([
    rpcRequest("message.list", { sessionId: sessionID, before, limit }),
    before ? Promise.resolve(undefined) : rpcRequest("director.list", { sessionId: sessionID }),
  ])
  const items = projectMessageEvents(page.items)
  return {
    items,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    directorRuns: directorRuns?.map(mapDirectorRunForView),
  } satisfies MessagePage
}

function directorAssistantId(value: JsonValue | null | undefined): number | string | null {
  return typeof value === "number" || typeof value === "string" ? value : null
}

function mapDirectorRunForView(run: DirectorRunInfo): CompanionDirectorRun {
  return {
    planID: run.planID,
    userMessageID: run.userMessageID,
    source: run.source,
    diagnostic: run.diagnostic,
    scene: run.scene ? {
      domain: run.scene.domain,
      interactionType: run.scene.interactionType,
      confidence: run.scene.confidence,
      summary: run.scene.summary,
    } : undefined,
    execution: run.execution ? {
      mode: run.execution.mode,
      leadAssistantID: directorAssistantId(run.execution.leadAssistantID),
      toolOwnerAssistantID: directorAssistantId(run.execution.toolOwnerAssistantID),
      observationStrategy: run.execution.observationStrategy,
    } : undefined,
    beats: run.beats.flatMap((beat) => {
      const assistantID = directorAssistantId(beat.assistantID)
      return assistantID === null ? [] : [{
        assistantID,
        intent: beat.intent,
        speechAct: beat.speechAct,
        addressTo: beat.addressTo,
        replyToBeat: beat.replyToBeat,
      }]
    }),
    status: run.status,
    activeBeatIndex: run.activeBeatIndex,
    completedBeatIndexes: run.completedBeatIndexes,
    participantCount: run.participantCount,
    error: run.error,
    createdAt: Number(run.createdAt),
    updatedAt: Number(run.updatedAt),
  }
}

async function listAllSessionEvents(sessionID: string, maximum = 10_000) {
  const events: import("@eden/api").SessionEvent[] = []
  let afterSeq = '0'
  while (events.length < maximum) {
    const page = await rpcRequest("event.list", { sessionId: sessionID, afterSeq, limit: 500 })
    events.push(...page.items)
    if (!page.hasMore || !page.nextCursor) break
    afterSeq = page.nextCursor
  }
  return events.slice(0, maximum)
}

export async function listMessages(sessionID: string) {
  const page = await listMessagesRaw(sessionID)
  return page.items.map(mapMessage)
}

export async function sendPrompt(sessionID: string, content: string, attachments: Array<PromptAttachment | string>) {
  const origin = getStoredRuntimeOrigin() ?? "mon"
  const environment = currentSessionEnvironment()
  return rpcRequestForOrigin(origin, "turn.start", {
    sessionId: sessionID,
    text: content,
    attachments: await uploadAttachments(attachments),
    environment,
  })
}

export async function sendPromptAsync(sessionID: string, content: string, attachments: Array<PromptAttachment | string>) {
  return sendPrompt(sessionID, content, attachments)
}

export async function compactSession(sessionID: string, instructions?: string) {
  await rpcRequest("session.compact", { sessionId: sessionID, instructions: instructions?.trim() || "" })
  return { accepted: true, sessionID }
}

export async function steerTurn(sessionID: string, content: string) {
  return rpcRequest("turn.steer", { sessionId: sessionID, text: content })
}

export async function followUpTurn(sessionID: string, content: string) {
  return rpcRequest("turn.follow_up", { sessionId: sessionID, text: content })
}

export async function abortSession(sessionID: string) {
  await rpcRequest("turn.cancel", { sessionId: sessionID })
  return { aborted: true, sessionID }
}

export async function interruptSubagent(sessionID: string, target: string) {
  void sessionID
  return mapAgentThread(await rpcRequest("agent.interrupt", { agentId: target }))
}

export async function getSubagentThreadDetails(sessionID: string, target: string, eventLimit = 500) {
  const threads = await rpcRequest("agent.list", { sessionId: sessionID })
  const agent = threads.find(thread => thread.id === target)
  if (!agent) throw new Error("Subagent is not part of the selected session tree")
  const events = await listAllSessionEvents(agent.childSessionId)
  return { thread: mapAgentThread(agent), events: events.slice(-Math.max(1, Math.min(eventLimit, 10000))) } satisfies import("../types").SubagentThreadDetails
}

export async function followupSubagent(sessionID: string, target: string, message: string) {
  void sessionID
  return mapAgentThread(await rpcRequest("agent.followup", { agentId: target, message }))
}

function mapAgentThread(agent: AgentThreadInfo): import("../types").SubagentThread {
  const mapped = mapAgentThreadForView(agent)
  if (!mapped) throw new Error(`Agent Server returned an invalid agent thread: ${agent.id}`)
  return mapped
}

export async function listPermissionsRaw() {
  return (await rpcRequest("permission.list", {})).filter(item => item.state === "pending").map((item) => ({
    id: item.id, sessionID: item.sessionId, permission: item.capability,
    patterns: [item.resource], metadata: item.request as Record<string, unknown>, always: [item.resource],
  })) as PendingPermission[]
}

export async function getPermissionMode() {
  return rpcRequest("permission.mode.get", {})
}

export async function setPermissionMode(mode: PermissionMode) {
  return rpcRequest("permission.mode.set", { mode })
}

export async function replyPermission(requestID: string, reply: "once" | "always" | "reject", message?: string) {
  await rpcRequest("permission.resolve", { requestId: requestID,
    decision: reply === "reject" ? "deny" : reply, ...(message ? { message } : {}) })
}

export async function listQuestionsRaw() {
  return (await rpcRequest("question.list", {})).map((item): PendingQuestion => ({
    id: item.id,
    sessionID: item.sessionId,
    questions: item.questions.map((question) => ({
      header: question.header,
      question: question.question,
      options: question.options.map((option) => ({
        label: option.label,
        description: option.description,
      })),
      ...(question.multiple == null ? {} : { multiple: question.multiple }),
      ...(question.custom == null ? {} : { custom: question.custom }),
    })),
  }))
}

export async function replyQuestion(requestID: string, answers: string[][]) {
  await rpcRequest("question.resolve", { requestId: requestID, answers })
}

export async function listScreenCaptureRequests() {
  return (await rpcRequest("media.list", { kind: "screen" })).map((item) => ({
    id: item.id, sessionID: item.sessionId, ...(item.request as Record<string, unknown>),
  })) as PendingScreenCapture[]
}

export async function replyScreenCapture(
  requestID: string,
  result?: {
    dataUrl: string
    mime: string
    width: number
    height: number
    displayId: string
    sourceName?: string
    source?: "desktop" | "game"
  },
  error?: string,
) {
  const origin = getStoredRuntimeOrigin() ?? "mon"
  if (Boolean(result) === Boolean(error)) throw new Error("Provide exactly one capture result or error")
  let payload: JsonValue | undefined
  if (result) {
    const [attachment] = await uploadAttachments([{ url: result.dataUrl, mime: result.mime, filename: "screen-capture" }])
    payload = { blobId: attachment.blobId, mime: attachment.mime, width: result.width,
      height: result.height, displayId: result.displayId, sourceName: result.sourceName ?? "", source: result.source ?? "desktop" }
  }
  await rpcRequestForOrigin(origin, "media.resolve", mediaResolveSchema.parse({ id: requestID, ...(payload ? { result: payload } : {}), ...(error ? { error } : {}) }))
  return true
}

export async function listCameraCaptureRequests() {
  return (await rpcRequest("media.list", { kind: "camera" })).map((item) => ({
    id: item.id, sessionID: item.sessionId, ...(item.request as Record<string, unknown>),
  })) as PendingCameraCapture[]
}

export async function replyCameraCapture(
  requestID: string,
  result?: {
    dataUrl: string
    mime: string
    width: number
    height: number
    deviceLabel?: string
    facingMode?: "user" | "environment" | string
  },
  error?: string,
) {
  const origin = getStoredRuntimeOrigin() ?? "mon"
  if (Boolean(result) === Boolean(error)) throw new Error("Provide exactly one capture result or error")
  let payload: JsonValue | undefined
  if (result) {
    const [attachment] = await uploadAttachments([{ url: result.dataUrl, mime: result.mime, filename: "camera-capture" }])
    payload = { blobId: attachment.blobId, mime: attachment.mime, width: result.width,
      height: result.height, deviceLabel: result.deviceLabel ?? "", facingMode: result.facingMode ?? "" }
  }
  await rpcRequestForOrigin(origin, "media.resolve", mediaResolveSchema.parse({ id: requestID, ...(payload ? { result: payload } : {}), ...(error ? { error } : {}) }))
  return true
}

export async function rejectQuestion(requestID: string) {
  await rpcRequest("question.reject", { requestId: requestID })
}

function mapToolInfoForView(tool: ToolInfo): ToolDefinition {
  const parameters = tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters)
    ? tool.parameters as Record<string, unknown>
    : {}
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters,
    source: tool.source,
    namespace: tool.namespace,
    exposure: tool.exposure,
    executionMode: tool.executionMode,
  }
}

export async function getToolStatus() {
  const definitions = (await rpcRequest("tool.list", {})).map(mapToolInfoForView)
  return { search: { status: "online", provider: "typescript-host", mode: "embedded" },
    tools: Object.fromEntries(definitions.map((tool) => [tool.name, "online"])),
    toolDetails: Object.fromEntries(definitions.map((tool) => [tool.name, tool])) } satisfies ToolStatus
}

export async function listWorkspaceDirectory(path = "") {
  const directory = await rpcRequestWithTimeout("workspace.list", { path }, 8_000)
  return {
    root: directory.root,
    path: directory.path,
    entries: directory.entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: null,
    })),
  } satisfies WorkspaceDirectory
}

export async function readWorkspaceFile(path: string): Promise<WorkspaceFileContent> {
  const file = await rpcRequest("workspace.read", { path })
  return { ...file, size: Number(file.size) }
}

export async function getWorkspace() {
  return rpcRequestWithTimeout("workspace.info", {}, 8_000)
}

export async function switchWorkspace(sessionId: string | undefined, path: string) {
  // Workspace changes are durable audited events and therefore need a session
  // in the server protocol. A pristine chat page has no session until its first
  // message, so materialize that draft here instead of disabling the workspace
  // picker and forcing the user to send a message first.
  const createdAuditSession = !sessionId
  const auditSessionId = sessionId || (await createSessionRaw()).id
  const result = await rpcRequest("workspace.switch", { sessionId: auditSessionId, path })
  return { ...result, auditSessionId, createdAuditSession }
}

export async function synthesizeSpeechSegment(input: {
  sessionId: string
  messageId: string
  segmentGroupId: string
  groupIndex: number
  sequence: number
  text: string
  configId: number
  mode: "text_only" | "all"
}) {
  const result = await rpcRequest("voice.tts.synthesize", {
    sessionId: input.sessionId,
    messageId: input.messageId,
    segmentGroupId: input.segmentGroupId,
    groupIndex: input.groupIndex,
    sequence: input.sequence,
    text: input.text,
    configId: input.configId,
    mode: input.mode,
  })
  return {
    ...result,
    duration_ms: result.duration_ms == null ? result.duration_ms : Number(result.duration_ms),
    size_bytes: result.size_bytes == null ? result.size_bytes : Number(result.size_bytes),
  }
}

export async function getVoiceRuntimeConfig() {
  const result = await rpcRequest("voice.config.read", {})
  return {
    tts: result.tts as LocalGsvConfig,
    stt: result.stt as LocalGsvSttConfig,
  }
}

export async function updateGsvTtsConfig(config: LocalGsvConfig) {
  const result = await rpcRequest("voice.tts.config.update", config)
  return {
    tts: result.tts as LocalGsvConfig,
    stt: result.stt as LocalGsvSttConfig,
  }
}

export async function updateGsvSttConfig(config: LocalGsvSttConfig) {
  const result = await rpcRequest("voice.stt.config.update", config)
  return {
    tts: result.tts as LocalGsvConfig,
    stt: result.stt as LocalGsvSttConfig,
  }
}

export async function discoverGsv(
  config: LocalGsvConfig,
  stage: "all" | "catalog" | "worlds" | "roles" | "emotions" = "all",
): Promise<LocalGsvDiscovery> {
  return rpcRequest("voice.gsv.discover", { config, stage }) as Promise<LocalGsvDiscovery>
}

export async function previewGsv(config: LocalGsvConfig, text: string, scope: import("./object-url-scope").ObjectUrlScope): Promise<LocalGsvPreview> {
  const result = await rpcRequest("voice.gsv.preview", { config, text })
  return {
    ok: result.ok as true,
    audioDataUrl: await resolveVoiceBlobUrl(result.audioBlobId, scope),
    mime: result.mime,
    duration: result.durationMs == null ? null : Number(result.durationMs) / 1000,
    latencyMs: result.latencyMs,
    roleId: result.roleId,
  }
}

export function testGsvStt(config: LocalGsvSttConfig) {
  return rpcRequest("voice.stt.test", { config })
}

export type PersistedSpeechSegment = import('@eden/api').VoiceSegmentInfo

export async function listMessageSpeechSegments(sessionId: string, messageId?: string) {
  const segments = await rpcRequest("voice.tts.list_segments", {
    sessionId,
    ...(messageId ? { messageId } : {}),
  })
  return segments.map((segment): PersistedSpeechSegment => ({
    ...segment,
    id: Number(segment.id),
    audio_asset_id: Number(segment.audio_asset_id),
    duration_ms: segment.duration_ms == null ? null : Number(segment.duration_ms),
  }))
}

export async function listSelfAwakeRuns(limit = 30) {
  return selfAwakeRuns(limit)
}

export function getSelfAwakeExecution(runId: string) {
  return rpcRequest("self_awake.execution", { runId })
}

export async function listSelfAwakeRunsPage({
  page = 1,
  pageSize = 20,
  q,
}: {
  page?: number
  pageSize?: number
  q?: string
} = {}) {
  const result = await rpcRequest("self_awake.list", {
    page,
    pageSize,
    ...(q?.trim() ? { query: q.trim() } : {}),
  })
  return {
    schedule: result.schedule,
    count: Number(result.count),
    next: result.page < result.totalPages ? String(result.page + 1) : null,
    previous: result.page > 1 ? String(result.page - 1) : null,
    page_size: result.pageSize,
    current_page: result.page,
    total_pages: result.totalPages,
    results: result.results.map(mapSelfAwakeRunForView),
  }
}

async function selfAwakeRuns(limit: number): Promise<ApiSelfAwakeRun[]> {
  return (await listSelfAwakeRunsPage({ page: 1, pageSize: Math.min(Math.max(limit, 1), 100) })).results
}

function recordValue(value: JsonValue | undefined | null): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : {}
}

function optionalText(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value : undefined
}

function epochIso(value: number | bigint | null | undefined) {
  if (value === null || value === undefined) return undefined
  const date = new Date(Number(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function mapSelfAwakeRunForView(run: SelfAwakeRunInfo): ApiSelfAwakeRun {
  const request = recordValue(run.request)
  const trigger = recordValue(request.trigger)
  const environment = recordValue(request.environment)
  const decision = recordValue(run.decision)
  const nextWake = recordValue(decision.next_wake)
  const author = recordValue(run.authorSnapshot)
  const afterMinutes = typeof nextWake.after_minutes === "number" ? nextWake.after_minutes : undefined
  const completedAt = epochIso(run.completedAt)
  const nextWakeAt = afterMinutes === undefined || !completedAt
    ? undefined
    : new Date(Date.parse(completedAt) + afterMinutes * 60_000).toISOString()
  const actionType = optionalText(decision.action)
  const actionPayload = recordValue(decision.action_payload)
  const actionMessage = optionalText(actionPayload.message)
    ?? optionalText(actionPayload.details)
    ?? optionalText(actionPayload.content)
    ?? ""
  const assistantId = optionalText(author.assistantId)
  const characterId = optionalText(author.characterId)
  return {
    id: run.id,
    assistant: assistantId ?? null,
    character: characterId ?? null,
    author: {
      assistant_id: assistantId ?? null,
      assistant_name: optionalText(author.assistantName) ?? "",
      character_id: characterId ?? null,
      character_name: optionalText(author.characterName) ?? "",
    },
    source_service: "eden-agent-server",
    external_run_id: run.id,
    event_type: optionalText(trigger.type) ?? "scheduled",
    event_source: optionalText(trigger.source) ?? "self_awake_runtime",
    event_reason: optionalText(trigger.reason) ?? optionalText(trigger.type) ?? "",
    event_id: run.eventId,
    event_occurred_at: optionalText(environment.utc_time) ?? optionalText(author.capturedAt) ?? null,
    status: run.status,
    started_at: epochIso(run.startedAt),
    finished_at: completedAt ?? null,
    context_payload: request,
    decision_payload: run.decision ? decision : null,
    mood: optionalText(decision.mood) ?? "",
    current_desire: optionalText(decision.current_desire) ?? "",
    should_interrupt_user: decision.should_interrupt_user === true,
    next_wake_at: nextWakeAt ?? null,
    next_wake_after_minutes: afterMinutes ?? null,
    next_wake_reason: optionalText(nextWake.reason) ?? "",
    error: run.lastError ?? "",
    created_at: epochIso(run.createdAt),
    updated_at: epochIso(run.updatedAt),
    diaries: run.diaries.map((diary) => {
      const metadata = recordValue(diary.metadata)
      return {
        id: diary.id,
        run: diary.runId,
        title: diary.title,
        content: diary.content,
        summary: optionalText(metadata.summary),
        tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
        importance: optionalText(metadata.importance),
        continuity_key: optionalText(metadata.continuityKey) ?? optionalText(metadata.continuity_key),
        visible_to_user: metadata.visibleToUser !== false && metadata.visible_to_user !== false,
        created_at: epochIso(diary.createdAt),
        updated_at: epochIso(diary.createdAt),
      }
    }),
    actions: actionType ? [{
      id: `${run.id}:decision-action`,
      run: run.id,
      action_type: actionType,
      message: actionMessage,
      payload: actionPayload,
      status: run.status === "completed" ? "completed" : run.status,
      error: run.lastError ?? "",
      created_at: completedAt ?? epochIso(run.updatedAt),
      updated_at: epochIso(run.updatedAt),
    }] : [],
  }
}

export async function listMemos(params: {
  kind?: string
  status?: string
  priority?: string
  q?: string
  limit?: number
} = {}) {
  const memos = await rpcRequest("memo.list", { limit: params.limit ?? 80, ...(params.q ? { query: params.q } : {}) })
  return memos.map((memo) => mapMemoForView(memo) as ApiMemo)
}

export async function createMemo(input: ApiMemoInput) {
  const memo = await rpcRequest("memo.create", memoCreateSchema.parse({ title: input.title, content: input.content ?? "",
    kind: input.kind ?? "note", status: input.status ?? "active", priority: input.priority ?? "normal",
    ...(input.remind_at ? { remindAt: Date.parse(input.remind_at) } : {}),
    ...(input.due_at ? { dueAt: Date.parse(input.due_at) } : {}),
    repeatRule: input.repeat_rule ?? "", relatedSessionId: "", metadata: (input.metadata ?? {}) as JsonValue }))
  return mapMemoForView(memo) as ApiMemo
}

export async function updateMemo(id: number, input: Partial<ApiMemoInput>) {
  const patch: Record<string, JsonValue> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.content !== undefined) patch.content = input.content
  if (input.kind !== undefined) patch.kind = input.kind
  if (input.status !== undefined) patch.status = input.status
  if (input.priority !== undefined) patch.priority = input.priority
  if (input.remind_at !== undefined) patch.remindAt = input.remind_at ? Date.parse(input.remind_at) : null
  if (input.due_at !== undefined) patch.dueAt = input.due_at ? Date.parse(input.due_at) : null
  if (input.repeat_rule !== undefined) patch.repeatRule = input.repeat_rule
  if (input.metadata !== undefined) patch.metadata = input.metadata as JsonValue
  return mapMemoForView(await rpcRequest("memo.update", { id, patch: memoPatchSchema.parse(patch) })) as ApiMemo
}

export async function completeMemo(id: number) {
  return mapMemoForView(await rpcRequest("memo.complete", { id })) as ApiMemo
}

export async function archiveMemo(id: number) {
  return updateMemo(id, { status: "archived" })
}

export async function snoozeMemo(id: number, input: { until?: string | null; minutes?: number }) {
  const snoozedUntil = input.until ? Date.parse(input.until) : Date.now() + Number(input.minutes ?? 0) * 60_000
  return mapMemoForView(await rpcRequest("memo.update", { id, patch: { snoozedUntil, status: "active" } })) as ApiMemo
}

export async function subscribeEvents(handlers: SubscribeHandlers | ((event: ApiEvent) => void)) {
  const normalizedRpc: SubscribeHandlers = typeof handlers === "function" ? { onEvent: handlers } : handlers
  let projectEvent = createSessionEventProjector()
  return subscribeRpcEvents(
    (event) => {
      for (const projected of projectEvent(event)) normalizedRpc.onEvent(projected)
    },
    (connected, error) => {
      if (connected) {
        projectEvent = createSessionEventProjector()
        normalizedRpc.onOpen?.()
      }
      else normalizedRpc.onError?.(error ?? "Eden Agent RPC disconnected")
    },
  )
}

export function createSessionEventProjector() {
  const activeMessages = new Map<string, string>()
  const toolOwners = new Map<string, string>()

  return (event: RpcSessionEvent): ApiEvent[] => {
    const key = `${event.sessionId}:${event.turnId ?? "none"}`
    const role = sessionEventMessageRole(event)
    if (event.eventType === "agent.message_start" && role !== "toolResult" && !activeMessages.has(key)) {
      activeMessages.set(key, event.id)
    }

    const toolCallID = sessionEventToolResultCallID(event)
    const ownerKey = toolCallID ? `${key}:${toolCallID}` : undefined
    const messageID = ownerKey ? toolOwners.get(ownerKey) : activeMessages.get(key)
    const projected = projectSessionEvent(event, messageID ?? sessionEventMessageID(event)) as ApiEvent[]

    for (const update of projected) {
      if (update.type !== "message.part.updated") continue
      const part = (update.properties as { part?: ApiPart }).part
      if (!part || !isApiToolPart(part) || part.state.status === "completed" || part.state.status === "error" || part.state.status === "aborted") continue
      toolOwners.set(`${key}:${part.id}`, part.messageID)
    }

    if (event.eventType === "agent.message_end" && role !== "toolResult") activeMessages.delete(key)
    if (event.eventType === "agent.message_end" && ownerKey) toolOwners.delete(ownerKey)
    if (event.eventType === "turn.completed" || event.eventType === "turn.failed" || event.eventType === "input.interrupted") {
      activeMessages.delete(key)
      for (const candidate of toolOwners.keys()) {
        if (candidate.startsWith(`${key}:`)) toolOwners.delete(candidate)
      }
    }
    return projected
  }
}
