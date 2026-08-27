import type { PetTTSMode } from "./desktop-window"

const MAX_SPEECH_CHARS = 160
const MIN_LENGTH_SPLIT_CHARS = 60
const MIN_SEMICOLON_SPLIT_CHARS = 28

const ENGLISH_ABBREVIATIONS = new Set([
  "dr",
  "e.g",
  "etc",
  "i.e",
  "jr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "sr",
  "st",
  "vs",
])

export interface CommittedSpeechChunk {
  start: number
  end: number
  text: string
  fingerprint: string
}

export interface SpeechStreamCursor {
  speakableText: string
  consumed: number
  committedChunks: number
  committed: CommittedSpeechChunk[]
}

export interface SpeechStreamUpdate {
  chunks: string[]
  cursor: SpeechStreamCursor
  resetRequired: boolean
}

export function speechStreamKey(messageId: string, textSegmentIndex: number, streamEpoch = 0) {
  return `${messageId}:speech:${Math.max(0, Math.trunc(textSegmentIndex))}:epoch:${Math.max(0, Math.trunc(streamEpoch))}`
}

function isMarkdownTableRow(line: string) {
  const value = line.trim()
  if (!value || !value.includes("|")) return false
  if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(value)) return true
  const separators = (value.match(/\|/g) ?? []).length
  return separators >= 1 && (value.startsWith("|") || value.endsWith("|") || /\s\|\s/.test(value))
}

function isMachineOnlyLine(line: string) {
  const value = line.trim()
  if (!value) return false
  return (
    /^(?:\{\s*|\}\s*,?|\[\s*|\]\s*,?)$/.test(value) ||
    /^(?:["'][^"']+["']|[A-Za-z_$][\w$.-]*)\s*:\s*(?:["'[{\d]|true\b|false\b|null\b)/.test(value) ||
    /^\[?\d{4}-\d{2}-\d{2}[T\s][^\]]+\]?\s*(?:\[[^\]]+\]\s*)*(?:DEBUG|INFO|WARN(?:ING)?|ERROR|CRITICAL)\b/i.test(value) ||
    /^(?:Traceback \(most recent call last\):|File "[^"]+", line \d+|at\s+\S+\s*\()/i.test(value) ||
    /^(?:\$\s+\S|[A-Z_][A-Z0-9_]*=\S)/.test(value)
  )
}

function isMachineInline(value: string) {
  const text = value.trim()
  return (
    !text ||
    /^(?:https?:\/\/|file:\/\/|[A-Za-z]:[\\/]|~?[./][\w.-]|[\w.-]+(?:[\\/][\w.@+-]+)+)/.test(text) ||
    /[{}[\]();=<>]/.test(text) ||
    /\.(?:json|ya?ml|toml|ini|log|py|tsx?|jsx?|sh|md|png|jpe?g|svg|wav|mp3|mp4)$/i.test(text) ||
    /^[a-f\d]{16,}$/i.test(text)
  )
}

function cleanSpeakableLine(line: string, mode: PetTTSMode) {
  let value = line.trim()
  if (!value || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(value)) return ""
  if (mode === "text_only" && /^\s*(?:\*[^*\n]+\*|_[^_\n]+_)\s*$/.test(value)) return ""
  if (isMachineOnlyLine(value)) return ""

  value = value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, (_match, content: string) => isMachineInline(content) ? " " : content)
    .replace(/<https?:\/\/[^>]+>/gi, " ")
    .replace(/https?:\/\/[^\s)\]}>,，。！？；]+/gi, " ")
    .replace(/(?:file:\/\/)?(?:[A-Za-z]:[\\/]|~?\.?\.?\/)?[\w.@+-]+(?:[\\/][\w.@+\- ]+){1,}/g, " ")
    .replace(/\b[a-f\d]{24,}\b/gi, " ")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/(\*\*|__|~~|\*|_)/g, "")
    .replace(/\\([\\`*_[\]{}()#+.!>|~-])/g, "$1")
    .replace(/[|]/g, " ")
    .replace(/[0-9#*]\uFE0F?\u20E3/g, " ")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, " ")
    .replace(/\u20E3/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim()

  if (/^[\p{L}\p{N}\s]{1,12}[：:]$/u.test(value)) return ""
  const semanticText = value.replace(/[\s，。！？!?；;：:、—-]/g, "")
  if (/^(?:(?:详细|文件|位于|网址|路径|地址|链接|参见|查看))+$/.test(semanticText)) return ""
  return /[\p{L}\p{N}]/u.test(value) ? value : ""
}

export function extractSpeakableText(text: string, mode: PetTTSMode) {
  if (mode === "none") return ""

  const source = mode === "text_only"
    ? text
        .replace(/（[^（）]*）/g, " ")
        .replace(/\([^()]*\)/g, " ")
    : text

  const speakable: string[] = []
  let fenced = false
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced || isMarkdownTableRow(line) || /^(?: {4}|\t)\S/.test(line)) continue
    const cleaned = cleanSpeakableLine(line, mode)
    if (cleaned) speakable.push(cleaned)
  }

  return speakable.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function textForTTS(text: string, mode: PetTTSMode) {
  return extractSpeakableText(text, mode)
}

function speechFingerprint(text: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${text.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`
}

function hasSpeechContent(text: string) {
  return /[\p{L}\p{N}]/u.test(text)
}

function englishTokenBeforePeriod(text: string, start: number, periodIndex: number) {
  return text.slice(start, periodIndex).match(/[A-Za-z](?:[A-Za-z.]*)$/)?.[0]?.toLowerCase() ?? ""
}

function isEnglishAbbreviation(text: string, start: number, periodIndex: number) {
  const token = englishTokenBeforePeriod(text, start, periodIndex)
  return (
    ENGLISH_ABBREVIATIONS.has(token) ||
    /^[a-z]$/i.test(token) ||
    /^(?:[a-z]\.)+[a-z]$/i.test(token)
  )
}

function absorbBoundarySuffix(text: string, start: number) {
  let end = start
  while (end < text.length && /[。！？!?；;.…"'”’）)\]]/.test(text[end])) end += 1
  while (end < text.length && /[ \t]/.test(text[end])) end += 1
  return end
}

function streamingBoundaryEnd(text: string, start: number, flush: boolean) {
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    const isNewline = character === "\n"
    const isStrongTerminal = /[。！？!?]/.test(character)
    const isSemicolon = /[；;]/.test(character) && index - start + 1 >= MIN_SEMICOLON_SPLIT_CHARS
    const isChineseEllipsis = character === "…" && text[index + 1] === "…"
    const isAsciiEllipsis = character === "." && text.slice(index, index + 3) === "..."
    let isEnglishPeriod = false
    if (character === "." && !isAsciiEllipsis) {
      const next = text[index + 1]
      const hasBoundaryLookahead = next !== undefined && /[\s"'”’）)\]]/.test(next)
      isEnglishPeriod = (flush && next === undefined) || (hasBoundaryLookahead && !isEnglishAbbreviation(text, start, index))
    }
    if (!isNewline && !isStrongTerminal && !isSemicolon && !isChineseEllipsis && !isAsciiEllipsis && !isEnglishPeriod) continue

    const punctuationEnd = isChineseEllipsis ? index + 2 : isAsciiEllipsis ? index + 3 : index + 1
    const end = absorbBoundarySuffix(text, punctuationEnd)
    // A terminal at the current stream tail is still provisional: the next
    // delta may turn `1.` into `1.8`, add a closing quote, or complete Markdown.
    if (!flush && !isNewline && end >= text.length) return -1
    return end
  }
  return -1
}

function streamingLengthBoundary(text: string, start: number) {
  if (text.length - start < MAX_SPEECH_CHARS) return -1
  const window = text.slice(start, start + MAX_SPEECH_CHARS + 1)
  const candidates = [...window.matchAll(/[，、,:：]/g)]
  const splitAt = [...candidates].reverse().find((match) => (match.index ?? 0) >= MIN_LENGTH_SPLIT_CHARS)?.index
  return start + (splitAt === undefined ? MAX_SPEECH_CHARS : splitAt + 1)
}

function planSpeechChunks(speakableText: string, flush: boolean) {
  const planned: CommittedSpeechChunk[] = []
  let consumed = 0
  let pendingPrefixStart: number | null = null

  while (consumed < speakableText.length) {
    while (consumed < speakableText.length && /[\s"'”’）)\]]/.test(speakableText[consumed])) consumed += 1
    if (consumed >= speakableText.length) break
    const start = consumed
    const sentenceEnd = streamingBoundaryEnd(speakableText, start, flush)
    const lengthEnd = streamingLengthBoundary(speakableText, start)
    let end = -1
    if (sentenceEnd >= 0 && lengthEnd >= 0) end = Math.min(sentenceEnd, lengthEnd)
    else end = Math.max(sentenceEnd, lengthEnd)
    if (end < 0) {
      if (!flush) break
      end = speakableText.length
    }

    const text = speakableText.slice(start, end).trim()
    consumed = end
    while (consumed < speakableText.length && /\s/.test(speakableText[consumed])) consumed += 1
    if (!hasSpeechContent(text)) {
      pendingPrefixStart ??= start
      continue
    }
    const committedStart = pendingPrefixStart ?? start
    const committedText = speakableText.slice(committedStart, end).trim()
    pendingPrefixStart = null
    planned.push({
      start: committedStart,
      end,
      text: committedText,
      fingerprint: speechFingerprint(committedText),
    })
  }

  return planned
}

function committedPrefixMatches(previous: readonly CommittedSpeechChunk[], next: readonly CommittedSpeechChunk[]) {
  if (next.length < previous.length) return false
  return previous.every((chunk, index) => {
    const candidate = next[index]
    return Boolean(
      candidate &&
      candidate.start === chunk.start &&
      candidate.end === chunk.end &&
      candidate.fingerprint === chunk.fingerprint &&
      candidate.text === chunk.text
    )
  })
}

/**
 * Consumes only complete, newly available speech units from incrementally growing text.
 * The unfinished tail stays behind the cursor until punctuation arrives or `flush` is true.
 */
export function consumeSpeechStream(
  text: string,
  mode: PetTTSMode,
  previous: SpeechStreamCursor | undefined,
  flush = false,
): SpeechStreamUpdate {
  const speakableText = extractSpeakableText(text, mode)
  const committed = planSpeechChunks(speakableText, flush)
  const previousCommitted = previous?.committed ?? []
  const resetRequired = previousCommitted.length > 0 && !committedPrefixMatches(previousCommitted, committed)
  const firstNewChunk = resetRequired ? 0 : previousCommitted.length
  const chunks = committed.slice(firstNewChunk).map((chunk) => chunk.text)
  const consumed = committed.at(-1)?.end ?? 0

  return {
    chunks,
    resetRequired,
    cursor: {
      speakableText,
      consumed,
      committedChunks: committed.length,
      committed,
    },
  }
}

export function speechChunksForTTS(text: string, mode: PetTTSMode) {
  return consumeSpeechStream(text, mode, undefined, true).chunks
}
