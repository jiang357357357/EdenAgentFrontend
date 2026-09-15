import type { ContextItem } from './context-sections.ts'

const contextObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const fields: Record<string, string> = {
  description: '角色简介', personality: '性格', social_relations: '人际关系',
  background: '背景经历', backstory: '背景故事', appearance: '外观',
  system_prompt: '角色提示词', signature: '签名',
}
const basicKeys = ['id', 'name', 'assistantId', 'assistantName', 'characterId', 'characterName', 'origin_world_name', 'world_names']

/** Only inspect known profile containers. Arrays and arbitrary nested data stay intact. */
export function characterItems(value: unknown, title: string): ContextItem[] {
  if (!Array.isArray(value)) return participantItems(value, title)
  return value.flatMap((participant, index) => participantItems(participant, `${title} ${index + 1}`))
}

function participantItems(value: unknown, title: string): ContextItem[] {
  const participant = contextObject(value), profile = contextObject(participant.profile)
  const containers = [participant, profile, contextObject(profile.character), contextObject(participant.character)]
  if (!Object.keys(participant).length) return [{ title, value }]
  const name = participant.characterName ?? participant.assistantName ?? profile.name ?? participant.name
  const prefix = typeof name === 'string' ? name : title
  const basic = containers.map(container => Object.fromEntries(basicKeys.filter(key => container[key] !== undefined).map(key => [key, container[key]])))
    .filter(container => Object.keys(container).length)
  const items: ContextItem[] = basic.length ? [{ title: `${prefix} · 基础资料`, value: basic }] : []
  for (const [key, label] of Object.entries(fields)) {
    const values = containers.map(container => container[key]).filter(content => content !== undefined && content !== null && content !== '')
    const unique = [...new Map(values.map(content => [JSON.stringify(content), content])).values()]
    if (unique.length) items.push({ title: `${prefix} · ${label}`, value: unique.length === 1 ? unique[0] : unique })
  }
  items.push({ title: `${prefix} · 完整角色资料`, value })
  return items
}
