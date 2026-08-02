export interface MessageContentChunk {
  action: boolean
  content: string
}

export function parseActionDescription(text: string): string | null {
  const value = text.trim()
  if (!value) return null

  const parenthesizedAction = /^(?:（([^（）\n]+)）|\(([^()\n]+)\))$/.exec(value)
  if (parenthesizedAction) {
    return (parenthesizedAction[1] ?? parenthesizedAction[2]).trim() || null
  }

  const markdownAction = /^(?:\*([^*\n]+)\*|_([^_\n]+)_)$/.exec(value)
  if (!markdownAction) return null
  return (markdownAction[1] ?? markdownAction[2]).trim() || null
}

function splitTrailingAction(line: string): { content: string; action: string } | null {
  // A trailing action must follow an explicit sentence boundary. This keeps
  // ordinary inline explanations such as `说明（仅供参考）` as regular text.
  const match = /^(.*[。！？!?…~～])\s*(?:（([^（）\n]+)）|\(([^()\n]+)\))\s*$/.exec(line)
  if (!match) return null

  const content = match[1].trimEnd()
  const action = (match[2] ?? match[3]).trim()
  if (!content || !action) return null
  return { content, action }
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
      const trailingAction = splitTrailingAction(line)
      if (trailingAction) {
        regularLines.push(trailingAction.content)
        flushRegularLines()
        chunks.push({ action: true, content: trailingAction.action })
      } else {
        regularLines.push(line)
      }
    }
  }
  flushRegularLines()
  return chunks
}
