import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const { SelfAwakeDiaryFooter } = await vite.ssrLoadModule('/src/pages/self-awake/SelfAwakeDiaryFooter.tsx')
const props = { runId: 'selected', statusLabel: '完成', nextWakeLabel: '10/15 20:00',
  timing: { status: 'completed' }, loading: false, error: '',
  record: { run: { id: 'selected', status: 'completed', startedAt: 1000, completedAt: 13_340 }, events: [
    { kind: 'model.request', payload: { requestId: 'one' } },
    { kind: 'model.response', payload: { requestId: 'one', usage: { input: 900, output: 40, cacheRead: 90, cacheWrite: 0, totalTokens: 1030 } } },
  ] } }
const render = changes => renderToStaticMarkup(createElement(SelfAwakeDiaryFooter, { ...props, ...changes }))

test('diary footer places duration and cumulative tokens beside status and this-run schedule', () => {
  const html = render()
  const values = ['状态', '本轮定时', '耗时', 'Token']
  const visible = html.replace(/<[^>]+>/g, '')
  assert.ok(values.every((label, i) => i === 0 || visible.indexOf(label) > visible.indexOf(values[i - 1])))
  for (const expected of ['完成', '10/15 20:00', '12.3 秒', '1,030']) assert.ok(html.includes(expected), expected)
  assert.doesNotMatch(html, /费用|¥|\$0/)
})

test('duration and token summaries are collapsed buttons for a click-open dialog', () => {
  const html = render()
  assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 2)
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2)
  assert.doesNotMatch(html, /role="dialog"|title="|缓存读取/)
})

test('selection changes and load failures never display the previous diary token amount', () => {
  for (const change of [{ runId: 'other' }, { loading: true }, { error: '读取失败' }]) {
    const html = render(change)
    assert.doesNotMatch(html, /1,030/)
    assert.match(html, /读取中|未知/)
  }
})

test('partial usage is labelled as a lower bound and missing history stays unknown', () => {
  const partial = { ...props.record, events: [...props.record.events, { kind: 'model.request', payload: { requestId: 'two' } }] }
  assert.match(render({ record: partial }), /至少 1,030/)
  const missing = render({ record: { run: { id: 'selected', status: 'completed' }, events: [] } })
  assert.match(missing, /未知/)
  assert.doesNotMatch(missing, />0<|不到 1 秒|1,030/)
})

test('legacy action remains alongside the metrics without inferring a missing price', () => {
  assert.match(render({ historicalAction: '写日记' }), /历史动作.*写日记/)
})
