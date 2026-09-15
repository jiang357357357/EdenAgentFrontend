import { characterItems } from './context-character.ts'
export type ContextItem = { title: string; value: unknown }
export type ContextSection = { title: string; items: ContextItem[] }
export const contextObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const contextText = (value: unknown): string => typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''
const roles: Record<string, string> = { user: '用户', assistant: '助手', tool: '工具结果', system: '系统', developer: '开发者' }

function messageItems(raw: unknown, index: number): ContextItem[] {
  const message = contextObject(raw)
  const title = `${index + 1}. ${roles[String(message.role)] ?? String(message.type ?? '消息')}`
  const items: ContextItem[] = []
  if (message.content != null && message.content !== '') {
    if (Array.isArray(message.content)) message.content.forEach((part, i) => {
      const block = contextObject(part)
      items.push({ title: `${title} · ${i + 1} ${String(block.type ?? '内容')}`, value: block.type === 'text' ? block.text : part })
    })
    else items.push({ title: message.role === 'tool' ? `${title} · ${message.name ?? message.tool_call_id ?? ''}` : title, value: message.content })
  }
  if (Array.isArray(message.tool_calls)) for (const call of message.tool_calls) {
    const data = contextObject(call), fn = contextObject(data.function)
    items.push({ title: `${index + 1}. 工具调用 · ${fn.name ?? data.name ?? data.id ?? ''}`, value: call })
  }
  const { role: _role, content: _content, tool_calls: _calls, ...rest } = message
  if (Object.keys(rest).length) items.push({ title: `${title} · 附加信息`, value: rest })
  return items.length ? items : [{ title, value: raw }]
}

export function contextSections(raw: unknown): ContextSection[] {
  const snapshot = contextObject(raw), payload = contextObject(snapshot.payload)
  const sources = Array.isArray(snapshot.contextSources) ? snapshot.contextSources.map(contextObject) : []
  const messages = Array.isArray(payload.messages) ? payload.messages : Array.isArray(payload.input) ? payload.input : []
  const sections: ContextSection[] = []
  for (const [kind, title] of [['character', '角色人设'], ['system', '系统规则'], ['skills', '技能目录'], ['memory', '召回记忆'], ['environment', '环境与会话信息']]) {
    const items = sources.filter(source => source.kind === kind).flatMap(source => kind === 'character' ? characterItems(source.content, String(source.title ?? title)) : [{ title: String(source.title ?? title), value: source.content }])
    if (items.length) sections.push({ title: title!, items })
  }
  const system = messages.filter(message => ['system', 'developer'].includes(String(contextObject(message).role)))
  if (!sources.some(source => source.kind === 'character')) {
    const values = [...system, ...[payload.system, payload.instructions].filter(value => value != null)]
    if (values.length) sections.push({ title: '系统内容（此快照未记录来源分类）', items: values.map((value, index) => ({ title: `系统内容 ${index + 1}`, value })) })
  }
  const lastUser = messages.reduce((last, message, index) => contextObject(message).role === 'user' ? index : last, -1)
  const history = messages.flatMap((message, index) => ['system', 'developer'].includes(String(contextObject(message).role)) || index === lastUser ? [] : messageItems(message, index))
  if (history.length) sections.push({ title: '对话历史与工具交互', items: history })
  if (lastUser >= 0) sections.push({ title: '本次请求输入', items: messageItems(messages[lastUser], lastUser) })
  const tools = payload.tools ?? snapshot.tools
  if (Array.isArray(tools) && tools.length) sections.push({ title: '工具定义', items: tools.map(tool => {
    const data = contextObject(tool), fn = contextObject(data.function)
    return { title: String(fn.name ?? data.name ?? data.type ?? '工具'), value: tool }
  }) })
  return sections
}
