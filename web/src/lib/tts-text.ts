import type { PetTTSMode } from "./desktop-window"

const MAX_SPEECH_CHARS = 180

export interface SpeechStreamCursor {
  speakableText: string
  consumed: number
  committedChunks: number
}

export interface SpeechStreamUpdate {
  chunks: string[]
  cursor: SpeechStreamCursor
}

export function speechStreamKey(messageId: string, textSegmentIndex: number) {
  return `${messageId}:speech:${Math.max(0, Math.trunc(textSegmentIndex))}`
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

function splitLongSentence(sentence: string) {
  const chunks: string[] = []
  let remaining = sentence.trim()
  while (remaining.length > MAX_SPEECH_CHARS) {
    const window = remaining.slice(0, MAX_SPEECH_CHARS + 1)
    const candidates = [...window.matchAll(/[，、,:：]/g)]
    const splitAt = [...candidates].reverse().find((match) => (match.index ?? 0) >= 60)?.index
    const end = splitAt === undefined ? MAX_SPEECH_CHARS : splitAt + 1
    chunks.push(remaining.slice(0, end).trim())
    remaining = remaining.slice(end).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

function streamingBoundaryEnd(text: string, start: number) {
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    const isNewline = character === "\n"
    const isTerminal = /[。！？!?；;]/.test(character)
    const isEnglishPeriod = character === "." && (index === text.length - 1 || /\s/.test(text[index + 1]))
    if (!isNewline && !isTerminal && !isEnglishPeriod) continue

    let end = index + 1
    while (end < text.length && /[。！？!?；;.\"'”’）)\]]/.test(text[end])) end += 1
    while (end < text.length && /[ \t]/.test(text[end])) end += 1
    return end
  }
  return -1
}

function streamingLengthBoundary(text: string, start: number) {
  if (text.length - start < MAX_SPEECH_CHARS) return -1
  const window = text.slice(start, start + MAX_SPEECH_CHARS + 1)
  const candidates = [...window.matchAll(/[，、,:：]/g)]
  const splitAt = [...candidates].reverse().find((match) => (match.index ?? 0) >= 60)?.index
  return start + (splitAt === undefined ? MAX_SPEECH_CHARS : splitAt + 1)
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
  const previousCommittedChunks = previous?.committedChunks ?? 0
  const parsedChunks: string[] = []
  let consumed = 0

  while (consumed < speakableText.length) {
    while (consumed < speakableText.length && /[\s\"'”’）)\]]/.test(speakableText[consumed])) consumed += 1
    if (consumed >= speakableText.length) break
    const sentenceEnd = streamingBoundaryEnd(speakableText, consumed)
    const lengthEnd = streamingLengthBoundary(speakableText, consumed)
    let end = -1
    if (sentenceEnd >= 0 && lengthEnd >= 0) end = Math.min(sentenceEnd, lengthEnd)
    else end = Math.max(sentenceEnd, lengthEnd)
    if (end < 0) break

    const chunk = speakableText.slice(consumed, end).trim()
    consumed = end
    while (consumed < speakableText.length && /\s/.test(speakableText[consumed])) consumed += 1
    if (chunk) parsedChunks.push(chunk)
  }

  if (flush && consumed < speakableText.length) {
    const remainder = speakableText.slice(consumed).trim()
    if (remainder) parsedChunks.push(...splitLongSentence(remainder))
    consumed = speakableText.length
  }

  // Treat the speech stream as an append-only sequence of logical units. The
  // rendered text may be rewritten while Markdown or canonical message parts are
  // completed, so byte offsets are not a safe deduplication key. Reparse the full
  // value and commit only ordinals beyond the append-only frontier.
  const chunks = parsedChunks.slice(previousCommittedChunks)

  return {
    chunks,
    cursor: {
      speakableText,
      consumed,
      committedChunks: Math.max(previousCommittedChunks, parsedChunks.length),
    },
  }
}

export function speechChunksForTTS(text: string, mode: PetTTSMode) {
  const speakable = extractSpeakableText(text, mode)
  if (!speakable) return []

  const sentences = speakable
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .flatMap(splitLongSentence)

  const chunks: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (!current) {
      current = sentence
      continue
    }
    const separator = /[。！？!?；;：:]$/.test(current) ? "" : "。"
    if (current.length + separator.length + sentence.length <= MAX_SPEECH_CHARS) {
      current += `${separator}${sentence}`
      continue
    }
    chunks.push(current)
    current = sentence
  }
  if (current) chunks.push(current)
  return chunks
}
