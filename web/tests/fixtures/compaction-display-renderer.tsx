import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MetaPartCard } from '../../src/components/chat/message/MetaPartCard'
import { createSessionEventProjector, projectMessageEvents } from '../../src/lib/agent-client'
import { initialRuntimeState, runtimeReducer, applyRuntimeEvent, hydrateSessionMessages } from '../../src/lib/session-reducer'
import { selectSessions } from '../../src/lib/session-selectors'
import type { SessionEventInput } from '../../src/lib/session-event'
import '../../src/index.css'

const root = createRoot(document.getElementById('root')!)
const project = createSessionEventProjector()
let state = initialRuntimeState
const base = { sessionId: 'synthetic-compaction', turnId: 'synthetic-turn', seq: 1n, createdAt: 1000n }
const progress = (seq: number, processed = 0): SessionEventInput => ({ ...base, id: `progress-${seq}`, seq: BigInt(seq),
  createdAt: BigInt(seq * 1000), eventType: 'agent.compaction_progress', payload: { processed, total: 327, resumed: false } })
const result: SessionEventInput = { ...base, id: 'result', seq: 3n, createdAt: 3000n, eventType: 'agent.session_compact',
  payload: { automatic: true, tokensAfter: 22018, compactionEntry: { summary: '保留用户需求、当前任务及已完成的工作。', tokensBefore: 232846 } } }
const checks: string[] = []
function assert(value: unknown, message: string) { if (!value) throw new Error(message) }
function render() {
  const session = selectSessions(state).find(session => session.id === base.sessionId)
  flushSync(() => root.render(<main style={{width:850,margin:'40px auto',padding:24}}>
    {session?.messages.flatMap(message => message.metaParts ?? []).map(part => <MetaPartCard key={part.id} part={part} />)}
  </main>))
}
function feed(source: SessionEventInput) {
  for (const event of project(source)) state = runtimeReducer(state, applyRuntimeEvent(event))
  render()
}
const text = () => document.getElementById('root')!.textContent ?? ''
const sections = () => document.querySelectorAll('main > section')
async function wait() { await new Promise(resolve => setTimeout(resolve, 50)) }

window.runCompactionDisplayChecks = async () => {
  feed(progress(1, 12))
  assert(sections().length === 1 && text().includes('正在整理历史') && !text().includes('已完成'), 'Progress was presented as a completed compaction')
  checks.push('实时进度显示正在整理，无已完成徽标')
  feed(progress(2, 327))
  assert(sections().length === 1 && text().includes('正在完成压缩'), 'Processed segments falsely became a completed result')
  feed(result)
  assert(sections().length === 1 && text().includes('232,846') && text().includes('22,018'), 'Final result did not replace progress')
  const summary = document.querySelector<HTMLButtonElement>('section button[aria-expanded]')!
  summary.click(); await wait()
  assert(document.querySelector('[aria-expanded="true"]') && text().includes('保留用户需求'), 'Completed summary cannot expand')
  assert(Boolean(document.querySelector('[title*="本地估算"]')), 'Token estimate lacks its explanation')
  checks.push('完成后仅一张结果卡，可展开摘要，统计注明估算口径')
  state = runtimeReducer(initialRuntimeState, hydrateSessionMessages(base.sessionId, {
    items: projectMessageEvents([progress(1), progress(2, 327), result]), hasMore: false,
  }))
  render()
  assert(sections().length === 1 && text().includes('压缩已完成'), 'Reopening history revived an obsolete progress card')
  checks.push('重新加载历史仍只显示一张最终结果')
  feed({ ...progress(4), turnId: 'next-turn', eventType: 'agent.auto_compaction_failed', payload: { message: 'synthetic private failure' } })
  assert(sections().length === 2 && text().includes('历史整理已暂停') && !text().includes('synthetic private failure'), 'Paused work was lost or presented as completed')
  checks.push('独立回合的失败显示已暂停，保留已有完成结果')
  feed({ ...result, id: 'next-result', turnId: 'next-turn', seq: 5n, createdAt: 5000n })
  assert(sections().length === 2 && !text().includes('历史整理已暂停'), 'Retry completion did not replace its paused progress')
  checks.push('重试成功替换对应暂停提示，不覆盖前一次压缩结果')
  state = runtimeReducer(initialRuntimeState, hydrateSessionMessages(base.sessionId, {
    items: projectMessageEvents([progress(1), progress(2, 327), result]), hasMore: false,
  }))
  render()
  document.querySelector<HTMLButtonElement>('section button[aria-expanded="false"]')?.click()
  await wait()
  return { passed: true, checks, completedCards: sections().length }
}

declare global { interface Window { runCompactionDisplayChecks(): Promise<{ passed: boolean; checks: string[]; completedCards: number }> } }
