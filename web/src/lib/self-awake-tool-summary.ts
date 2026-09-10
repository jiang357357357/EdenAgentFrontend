import type { SelfAwakeToolExecution } from './self-awake-context'

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function unpack(value: unknown): unknown {
  const content = object(value).content
  if (Array.isArray(content)) {
    const text = content.filter(item => object(item).type === 'text').map(item => object(item).text).join('\n')
    try { return JSON.parse(text) } catch { return text }
  }
  if (typeof value === 'string') { try { return JSON.parse(value) } catch { return value } }
  return value
}
const sections: Record<string, string> = {
  request: '本轮自醒信息', recent_events: '近期事件', desktop_session: '桌面会话状态',
  recent_diaries: '近期日记', recent_contacts: '近期联系记录', memories: '记忆',
}
const names: Record<string, string> = {
  get_self_awake_context: '读取自醒上下文', list_due_memos: '查询到期备忘',
  list_memos: '查询备忘', set_self_awake_timer: '设置下次自醒',
}
export function selfAwakeToolSummary(execution: SelfAwakeToolExecution) {
  const args = object(execution.args), value = unpack(execution.rawResult), data = object(value)
  const section = sections[String(args.section ?? data.section)]
  const title = execution.name === 'get_self_awake_context' && section ? `读取${section}` : names[execution.name] ?? execution.name
  let summary = execution.status === 'running' ? '正在执行…' : '已完成，展开详情查看返回内容。'
  if (execution.status === 'failed') summary = '调用失败，展开详情查看错误信息。'
  else if (execution.status === 'succeeded') {
    if (data.available === false) summary = '当前没有可用数据。'
    else if (execution.name === 'list_due_memos' && Array.isArray(value)) summary = value.length ? `查到 ${value.length} 条到期备忘。` : '没有到期备忘。'
    else if (execution.name === 'list_memos' && Array.isArray(value)) summary = value.length ? `查到 ${value.length} 条备忘。` : '没有匹配的备忘。'
    else if (Array.isArray(data.diaries)) summary = `读取到 ${data.diaries.length} 篇日记。`
    else if (Array.isArray(data.contacts)) summary = `读取到 ${data.contacts.length} 条联系记录；不代表用户已读。`
    else if (execution.name === 'set_self_awake_timer' && typeof data.dueAt === 'number' && Number.isFinite(new Date(data.dueAt).getTime())) {
      summary = `下次自醒：${new Date(data.dueAt).toLocaleString('zh-CN', { hour12: false })}。`
      if (typeof args.reason === 'string' && args.reason.trim()) summary += ` 原因：${args.reason}`
    } else if (execution.name === 'get_self_awake_context') summary = `已读取${section ?? '上下文'}。`
    if (data.stale === true) summary += ' 数据已过期，仅供参考。'
  }
  return { title, summary, decodedResult: value }
}
