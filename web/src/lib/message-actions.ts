export interface MessageContentChunk {
  action: boolean
  content: string
}

export function parseActionDescription(text: string): string | null {
  const value = text.trim()
  if (!value) return null
  if (/^(?:（[\s\S]*）|\([\s\S]*\))$/.test(value)) return value

  const markdownAction = /^(?:\*([^*\n]+)\*|_([^_\n]+)_)$/.exec(value)
  if (!markdownAction) return null
  return (markdownAction[1] ?? markdownAction[2]).trim() || null
}

export function splitActionLines(content: string): MessageContentChunk[] {
  const chunks: MessageContentChunk[] = []
  let regularLines: string[] = []
  const flushRegularLines = () => {
    const value = regularLines.join("\n").trim()
    if (value) chunks.push({ action: false, content: value })
    regularLines = []
  }

  for (const line of content.split("\n")) {
    const action = parseActionDescription(line)
    if (action !== null) {
      flushRegularLines()
      chunks.push({ action: true, content: action })
    } else {
      regularLines.push(line)
    }
  }
  flushRegularLines()
  return chunks
}
