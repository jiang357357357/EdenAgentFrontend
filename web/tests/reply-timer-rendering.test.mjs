import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const { ReplyTimerDisplay } = await vite.ssrLoadModule('/src/components/chat/input/ReplyTimer.tsx')
const render = props => renderToStaticMarkup(createElement(ReplyTimerDisplay, props))

test('timer has an icon, visible elapsed time, keyboard tooltip and running state without announcing every tick', () => {
  const html = render({ elapsedMs: 83000, running: true })
  assert.match(html, /lucide-timer/)
  assert.match(html, /01:23/)
  assert.match(html, /正在回答/)
  assert.match(html, /role="timer" aria-live="off" tabindex="0" aria-describedby=/)
  assert.match(html, /思考耗时/)
  assert.match(html, /工具耗时/)
  assert.match(html, /会话耗时/)
  assert.match(html, /会话为本轮总耗时，不计排队/)
})

test('tooltip shows independent phase times, current turn total and unavailable historical detail', () => {
  const html = render({ elapsedMs: 21000, running: false, outcome: 'completed',
    durations: { thinkingMs: 12000, toolMs: 9000, turnMs: 21000 } })
  for (const time of ['00:21', '00:12', '00:09']) assert.ok(html.includes(time))
  assert.doesNotMatch(html, /分项计时待服务端记录恢复/)
  assert.match(render({ elapsedMs: 21000, running: false }), /分项计时待服务端记录恢复/)
})

test('finished, stopped, loading and disconnected states are distinct', () => {
  assert.match(render({ elapsedMs: 62000, running: false, outcome: 'completed' }), /回答结束/)
  assert.match(render({ elapsedMs: 12000, running: false, outcome: 'interrupted' }), /已停止/)
  assert.match(render({ elapsedMs: 0, running: false, loading: true }), /--:--/)
  assert.match(render({ elapsedMs: 6000, running: true, reconnecting: true }), /耗时待核实/)
  assert.match(render({ elapsedMs: 0, running: false, unavailable: true }), /计时记录暂时无法读取/)
})
