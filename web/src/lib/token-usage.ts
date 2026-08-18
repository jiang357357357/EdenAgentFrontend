type TokenToolCall = {
  input?: string
  output?: string
  error?: string
}

type TokenSegment = {
  type: string
  content?: string
  tool?: TokenToolCall
  part?: {
    type?: string
    contextTokensAfter?: number
  }
}

type TokenMessage = {
  content?: string
  thinking?: string
  runtimeTrace?: string
  segments?: TokenSegment[]
  toolCalls?: TokenToolCall[]
  images?: string[]
}

const CJK_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const EMOJI_CHARACTER = /\p{Extended_Pictographic}/u

export const DEFAULT_CONTEXT_WINDOW = 256_000

const PROMPT_CACHE_REASON_LABELS: Record<string, string> = {
  initial: "初始",
  stable: "稳定",
  provider: "供应商变更",
  model: "模型变更",
  api: "接口变更",
  reasoning: "推理级别变更",
  system: "系统提示词变更",
  tools: "工具定义变更",
  fingerprint: "前缀变更",
}

export function formatPromptCacheState(epoch = 0, reason?: string): string {
  const labels = String(reason || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => PROMPT_CACHE_REASON_LABELS[item] ?? item)
  return `第 ${Math.max(0, Math.trunc(epoch))} 代 · ${labels.join("、") || "未知"}`
}

export function estimateTextTokens(value: string): number {
  const text = value.normalize("NFC")
  if (!text.trim()) return 0

  let directTokens = 0
  let latinLikeCharacters = 0
  let otherCharacters = 0

  for (const character of Array.from(text)) {
    if (CJK_CHARACTER.test(character) || EMOJI_CHARACTER.test(character)) {
      directTokens += 1
    } else if (/\s|[\x00-\x7F]/u.test(character)) {
      latinLikeCharacters += 1
    } else {
      otherCharacters += 1
    }
  }

  return directTokens + Math.ceil(latinLikeCharacters / 4) + Math.ceil(otherCharacters / 2)
}

function estimateToolTokens(tool: TokenToolCall | undefined) {
  if (!tool) return 0
  return estimateTextTokens([tool.input, tool.output, tool.error].filter(Boolean).join("\n"))
}

export function estimateConversationTokens(messages: TokenMessage[]): number {
  return messages.reduce((total, message) => {
    let messageTokens = 0

    if (message.segments?.length) {
      for (const segment of message.segments) {
        if (
          segment.type === "meta" &&
          segment.part?.type === "compaction" &&
          typeof segment.part.contextTokensAfter === "number"
        ) {
          total = Math.max(0, segment.part.contextTokensAfter)
          continue
        }
        messageTokens += estimateTextTokens(segment.content ?? "")
        messageTokens += estimateToolTokens(segment.tool)
      }
    } else {
      messageTokens += estimateTextTokens(message.content ?? "")
      messageTokens += estimateTextTokens(message.thinking ?? "")
      messageTokens += estimateTextTokens(message.runtimeTrace ?? "")
      for (const tool of message.toolCalls ?? []) messageTokens += estimateToolTokens(tool)
    }

    messageTokens += (message.images?.length ?? 0) * 1_200
    return total + messageTokens
  }, 0)
}

export function formatTokenCount(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value)))
}
