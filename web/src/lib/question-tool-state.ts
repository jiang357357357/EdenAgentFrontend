import type { MessageData, PendingQuestion, ToolCall } from '../types'

export function questionMatchesTool(request: PendingQuestion, sessionID: string, toolID: string, messageID?: string, turnID?: string) {
  if (request.sessionID !== sessionID) return false
  const callID = request.toolCallID ?? request.tool?.callID
  if (!callID || callID !== toolID) return false
  if (request.tool?.messageID && request.tool.messageID !== messageID) return false
  return !(request.turnID && turnID && request.turnID !== turnID)
}

export function unplacedQuestions(requests: PendingQuestion[], sessionID: string, messages: MessageData[]) {
  return requests.filter(request => request.sessionID === sessionID && !messages.some(message => {
    if (message.role !== 'assistant' || message.kind === 'slash-command') return false
    const tools = message.segments?.length ? message.segments.flatMap(segment => segment.type === 'tool' ? [segment.tool] : []) : message.toolCalls ?? []
    return tools.some(tool => questionMatchesTool(request, sessionID, tool.id, message.id, message.runID))
  }))
}

export function questionAnswers(tool: ToolCall): Array<{ question: string; answers: string[] }> {
  if (tool.name !== 'request_user_input' || tool.status !== 'success' || !tool.output) return []
  try {
    const output: unknown = JSON.parse(tool.output)
    if (!output || typeof output !== 'object' || !('answers' in output) || !Array.isArray(output.answers)) return []
    if (!output.answers.length || !output.answers.every(row => Array.isArray(row) && row.length && row.every(value => typeof value === 'string'))) return []
    let questions: unknown[] = []
    try { questions = JSON.parse(tool.input).questions ?? [] } catch { /* Older tools may not retain their input. */ }
    return output.answers.flatMap((answers: unknown, index: number) => {
      if (!Array.isArray(answers) || !answers.every(value => typeof value === 'string')) return []
      const item = questions[index]
      const question = item && typeof item === 'object' && 'question' in item && typeof item.question === 'string' ? item.question : `问题 ${index + 1}`
      return [{ question, answers }]
    })
  } catch { return [] }
}
