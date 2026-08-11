import type { MessageData, ToolCall } from "../types"

export type RunReviewPatch = {
  toolID: string
  patch: string
}

export type RunReviewFile = {
  path: string
  movePath?: string | null
  status?: string
  additions: number
  deletions: number
  patches: RunReviewPatch[]
}

export type RunReview = {
  runID: string
  snapshot: boolean
  files: RunReviewFile[]
  additions: number
  deletions: number
}

export type RunReviewIndex = Map<number, RunReview>

type DiffFile = {
  path?: unknown
  movePath?: unknown
  status?: unknown
  additions?: unknown
  deletions?: unknown
  patch?: unknown
}

function messageTools(message: MessageData): ToolCall[] {
  const tools = [...(message.toolCalls ?? [])]
  for (const segment of message.segments ?? []) {
    if (segment.type === "tool" && !tools.some((tool) => tool.id === segment.tool.id)) tools.push(segment.tool)
  }
  return tools
}

function diffFiles(tool: ToolCall): DiffFile[] | undefined {
  if (!tool.details || typeof tool.details !== "object" || Array.isArray(tool.details)) return undefined
  const details = tool.details as { kind?: unknown; files?: unknown }
  return details.kind === "workspace_diff" && Array.isArray(details.files) ? details.files as DiffFile[] : undefined
}

export function isLastMessageOfRun(messages: MessageData[], index: number) {
  const runID = messages[index]?.runID
  if (!runID) return false
  return !messages.slice(index + 1).some((message) => message.runID === runID)
}

export function buildRunReview(messages: MessageData[], runID: string): RunReview | undefined {
  return buildReviewFromMessages(messages.filter((message) => message.runID === runID), runID)
}

function buildReviewFromMessages(messages: MessageData[], runID: string): RunReview | undefined {
  const tools: ToolCall[] = []
  const seenToolIDs = new Set<string>()
  for (const message of messages) {
    for (const tool of messageTools(message)) {
      if (seenToolIDs.has(tool.id)) continue
      seenToolIDs.add(tool.id)
      tools.push(tool)
    }
  }
  const latestSnapshot = [...tools].reverse().find((tool) => tool.name === "get_diff" && diffFiles(tool))
  const reviewTools = latestSnapshot
    ? [latestSnapshot]
    : tools.filter((tool) => ["write", "edit", "apply_patch"].includes(tool.name) && diffFiles(tool))
  if (reviewTools.length === 0) return undefined

  const files = new Map<string, RunReviewFile>()
  for (const tool of reviewTools) {
    for (const raw of diffFiles(tool) ?? []) {
      if (typeof raw.path !== "string" || !raw.path) continue
      const movePath = typeof raw.movePath === "string" ? raw.movePath : null
      const key = movePath || raw.path
      const additions = typeof raw.additions === "number" ? raw.additions : 0
      const deletions = typeof raw.deletions === "number" ? raw.deletions : 0
      const current = files.get(key) ?? {
        path: raw.path,
        movePath,
        status: typeof raw.status === "string" ? raw.status : undefined,
        additions: 0,
        deletions: 0,
        patches: [],
      }
      current.additions += additions
      current.deletions += deletions
      if (typeof raw.patch === "string" && raw.patch) current.patches.push({ toolID: tool.id, patch: raw.patch })
      current.status = typeof raw.status === "string" ? raw.status : current.status
      current.movePath = movePath || current.movePath
      files.set(key, current)
    }
  }
  const result = [...files.values()]
  if (result.length === 0) return undefined
  return {
    runID,
    snapshot: Boolean(latestSnapshot),
    files: result,
    additions: result.reduce((sum, file) => sum + file.additions, 0),
    deletions: result.reduce((sum, file) => sum + file.deletions, 0),
  }
}

/**
 * Builds every visible run review in one pass over the message list.
 *
 * The map is keyed by the index of the run's final visible message so the
 * render loop can perform a constant-time lookup instead of rescanning the
 * full history for every message and every run.
 */
export function buildRunReviewIndex(messages: MessageData[]): RunReviewIndex {
  const runs = new Map<string, { messages: MessageData[]; lastIndex: number }>()
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (!message.runID) continue
    const run = runs.get(message.runID)
    if (run) {
      run.messages.push(message)
      run.lastIndex = index
    } else {
      runs.set(message.runID, { messages: [message], lastIndex: index })
    }
  }

  const reviews: RunReviewIndex = new Map()
  for (const [runID, run] of runs) {
    const review = buildReviewFromMessages(run.messages, runID)
    if (review) reviews.set(run.lastIndex, review)
  }
  return reviews
}
