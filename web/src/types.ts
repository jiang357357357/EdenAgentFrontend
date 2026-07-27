export type Role = "user" | "assistant"
export type SessionStatus = "idle" | "busy" | "retry"
export type ConnectionState = "connecting" | "connected" | "disconnected"
export type PermissionMode = "restricted" | "full_access" | "takeover"

export interface ToolCall {
  id: string
  name: string
  status: "running" | "success" | "error"
  input: string
  output?: string
  duration?: number
  error?: string
}

export interface MetaPartCard {
  id: string
  type: string
  title: string
  summary?: string
  detail?: string
  tone?: "default" | "muted" | "accent" | "warning"
  contextTokensAfter?: number
}

export interface PermissionToolRef {
  messageID: string
  callID: string
}

export interface PendingPermission {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
  tool?: PermissionToolRef
}

export interface QuestionOption {
  label: string
  description: string
}

export interface PendingQuestionItem {
  header: string
  question: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export interface PendingQuestion {
  id: string
  sessionID: string
  questions: PendingQuestionItem[]
  tool?: PermissionToolRef
}

export interface MessageData {
  id: string
  kind?: string
  renderKey?: string
  runID?: string
  role: Role
  content: string
  timestamp: string
  segments?: MessageSegment[]
  runtimeTrace?: string
  runtimeTraceState?: "streaming" | "done"
  thinking?: string
  thinkingState?: "streaming" | "done"
  toolCalls?: ToolCall[]
  metaParts?: MetaPartCard[]
  images?: string[]
  isStreaming?: boolean
  error?: MessageError
  completionState?: "provisional" | "final"
  coordinationBatchID?: string | null
  speaker?: {
    assistantID: number | string
    assistantName: string
    characterID?: number | string | null
    characterName?: string
    avatarUrl?: string
    standingImageUrl?: string
    ttsConfigID?: number | null
    turnIndex?: number
    beatIndex?: number
  }
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
}

export interface MessageError {
  title: string
  message: string
  detail?: string
  model?: string
}

export type MessageSegment =
  | {
      id: string
      type: "text"
      content: string
      state?: "streaming" | "done"
    }
  | {
      id: string
      type: "runtimeTrace"
      content: string
      state?: "streaming" | "done"
    }
  | {
      id: string
      type: "thinking"
      content: string
      state?: "streaming" | "done"
    }
  | {
      id: string
      type: "tool"
      tool: ToolCall
    }
  | {
      id: string
      type: "meta"
      part: MetaPartCard
    }
  | {
      id: string
      type: "image"
      url: string
      filename?: string
    }

export interface PromptAttachment {
  url: string
  mime: string
  filename?: string
  size?: number
}

export interface Session {
  id: string
  title: string
  contextTokens?: number
  date: string
  messages: MessageData[]
  mode?: "companion" | "solo"
  participants?: import("./lib/mon_agent_api").SessionParticipant[]
  directorRun?: CompanionDirectorRun
  directorRuns?: CompanionDirectorRun[]
  agentThreads?: SubagentThread[]
  coordinationBatches?: CoordinationBatch[]
  orchestratorRun?: OrchestratorRun
  orchestratorRuns?: OrchestratorRun[]
}

export interface OrchestratorRun {
  orchestrationID: string
  userMessageID?: string
  status: "planning" | "running" | "completed" | "failed"
  phase?: string
  toolName?: string
  summary?: string
  error?: string
  createdAt?: number
  updatedAt?: number
}

export type SubagentStatus =
  | "created"
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled"

export interface SubagentResult {
  content: string
  summary?: string
  artifacts?: Array<Record<string, unknown>>
  changedFiles?: string[]
  tests?: Array<Record<string, unknown>>
  details?: Record<string, unknown>
}

export interface SubagentThread {
  id: string
  rootSessionID: string
  parentID?: string | null
  agentPath: string
  taskName: string
  role: string
  status: SubagentStatus
  depth: number
  createdAt: number
  updatedAt: number
  startedAt?: number | null
  completedAt?: number | null
  error?: string | null
  result?: SubagentResult | null
  metadata?: Record<string, unknown>
}

export interface SubagentThreadDetails {
  thread: SubagentThread
  events: Array<Record<string, unknown>>
  checkpoint?: {
    updatedAt?: number
    messageCount?: number
    messages?: Array<Record<string, unknown>>
    activeSkillIDs?: string[]
    thinkingLevel?: string
    toolPolicy?: Record<string, unknown>
    budget?: {
      maxTurns?: number
      maxToolCalls?: number
      timeoutSeconds?: number
    }
    budgetUsage?: {
      turnCount?: number
      toolCallCount?: number
      elapsedMs?: number
      exceededReason?: string | null
    }
    [key: string]: unknown
  } | null
}

export type CoordinationBatchStatus =
  | "collecting"
  | "ready"
  | "aggregating"
  | "aggregation_failed"
  | "completed"
  | "cancelled"

export interface CoordinationBatch {
  batchID: string
  status: CoordinationBatchStatus
  requiredTotal: number
  requiredTerminal: number
  optionalTotal: number
  objectiveEpoch: number
  updatedAt?: number
}

export interface CompanionDirectorBeat {
  assistantID: number | string
  intent: string
  speechAct: string
  addressTo: string
  replyToBeat?: number | null
}

export interface CompanionDirectorScene {
  domain: "social" | "coding" | "game" | "daily" | "research" | "mixed" | "general"
  interactionType: "conversation" | "task" | "mixed"
  confidence: number
  summary: string
}

export interface CompanionDirectorExecution {
  mode: "solo" | "lead_support" | "ensemble"
  leadAssistantID?: number | string | null
  toolOwnerAssistantID?: number | string | null
  observationStrategy: "none" | "on_demand" | "shared" | "independent"
}

export interface CompanionDirectorRun {
  planID?: string
  userMessageID?: string
  source?: string
  diagnostic?: string | null
  scene?: CompanionDirectorScene
  execution?: CompanionDirectorExecution
  beats: CompanionDirectorBeat[]
  status: "planning" | "planned" | "running" | "completed" | "failed"
  activeBeatIndex?: number
  completedBeatIndexes: number[]
  participantCount?: number
  error?: string | null
  createdAt?: number
  updatedAt?: number
}

export interface RuntimeTextPart {
  id: string
  type: "text"
  text: string
  done: boolean
}

export interface RuntimeReasoningPart {
  id: string
  type: "reasoning"
  text: string
  done: boolean
  source?: "runtime" | "model"
  title?: string
}

export interface RuntimeFilePart {
  id: string
  type: "file"
  mime: string
  url: string
  filename?: string
}

export interface RuntimeSnapshotPart {
  id: string
  type: "snapshot"
  snapshot: string
}

export interface RuntimePatchPart {
  id: string
  type: "patch"
  hash: string
  files: string[]
}

export interface RuntimeAgentPart {
  id: string
  type: "agent"
  name: string
  source?: {
    value: string
    start: number
    end: number
  }
}

export interface RuntimeCompactionPart {
  id: string
  type: "compaction"
  auto: boolean
  overflow?: boolean
  tail_start_id?: string
  tokensBefore?: number
  tokensAfter?: number
}

export interface RuntimeSubtaskPart {
  id: string
  type: "subtask"
  prompt: string
  description: string
  agent: string
  command?: string
  model?: {
    providerID: string
    modelID: string
  }
}

export interface RuntimeRetryPart {
  id: string
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

export interface RuntimeStepStartPart {
  id: string
  type: "step-start"
  snapshot?: string
}

export interface RuntimeStepFinishPart {
  id: string
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

export interface RuntimeToolPart {
  id: string
  type: "tool"
  tool: string
  state:
    | { status: "pending" | "running"; input?: unknown; time?: { start?: number; end?: number } }
    | {
        status: "completed"
        input?: unknown
        output: string
        time?: { start?: number; end?: number; compacted?: number }
      }
    | { status: "error"; input?: unknown; error: string; time?: { start?: number; end?: number } }
}

export interface RuntimeUnknownPart {
  id: string
  type: string
  raw: Record<string, unknown>
}

export type RuntimePart =
  | RuntimeTextPart
  | RuntimeReasoningPart
  | RuntimeFilePart
  | RuntimeSnapshotPart
  | RuntimePatchPart
  | RuntimeAgentPart
  | RuntimeCompactionPart
  | RuntimeSubtaskPart
  | RuntimeRetryPart
  | RuntimeStepStartPart
  | RuntimeStepFinishPart
  | RuntimeToolPart
  | RuntimeUnknownPart

export interface RuntimeMessage {
  id: string
  kind?: string
  renderKey?: string
  sessionID: string
  runID?: string
  role: Role
  partOrder: string[]
  parts: Record<string, RuntimePart>
  createdAt?: number
  completedAt?: number
  localOnly?: boolean
  optimisticPartIDs?: string[]
  modelID?: string
  providerID?: string
  completionState?: "provisional" | "final"
  coordinationBatchID?: string | null
  speaker?: import("./lib/mon_agent_api").SessionParticipant & { turnIndex?: number; beatIndex?: number }
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
  }
}

export interface RuntimeSession {
  id: string
  title: string
  contextTokens?: number
  status: SessionStatus
  messageOrder: string[]
  messages: Record<string, RuntimeMessage>
  createdAt?: number
  updatedAt?: number
  hydrated: boolean
  error?: string
  mode?: "companion" | "solo"
  participants?: import("./lib/mon_agent_api").SessionParticipant[]
  directorPolicy?: Record<string, unknown>
  directorRun?: CompanionDirectorRun
  directorRuns?: CompanionDirectorRun[]
  agentThreads?: SubagentThread[]
  coordinationBatches?: CoordinationBatch[]
  orchestratorRun?: OrchestratorRun
  orchestratorRuns?: OrchestratorRun[]
}

export interface RuntimeState {
  sessions: Record<string, RuntimeSession>
  sessionOrder: string[]
  permissions: Record<string, PendingPermission>
  permissionOrder: string[]
  questions: Record<string, PendingQuestion>
  questionOrder: string[]
  activeSessionId?: string
  connectionState: ConnectionState
  connectionError?: string
}
