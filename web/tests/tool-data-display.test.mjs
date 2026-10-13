import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { toolDataDisplay, toolFieldLabel } from '../src/lib/tool-data-display.ts'

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const [{ ToolParameters }, { ToolOutput }, { ChatDialogPanel }, { SelfAwakeToolCard }] = await Promise.all([
  vite.ssrLoadModule('/src/components/chat/message/ToolParameters.tsx'),
  vite.ssrLoadModule('/src/components/chat/message/ToolOutput.tsx'),
  vite.ssrLoadModule('/src/components/chat/input/ChatDialogPanel.tsx'),
  vite.ssrLoadModule('/src/pages/self-awake/SelfAwakeToolCard.tsx'),
])
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const decode = text => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const preTexts = html => [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)].map(match => decode(match[1]))

test('every input/output variant preserves multilevel strings and real LF/CRLF in objects and arrays', () => {
  const value = { message: '第一行\n  第二行', results: ['one\r\ntwo', { content: 'nested\n  content' }] }
  const text = JSON.stringify(value)
  for (const variant of ['chat', 'dialog', 'pet']) {
    for (const [component, prop] of [[ToolParameters, 'input'], [ToolOutput, 'output']]) {
      const html = render(component, { [prop]: text, variant })
      assert.deepEqual(preTexts(html).slice(0, 2), [value.message, value.results[0]])
      assert.match(html, /第 2 项 · 1 项/)
      assert.deepEqual(preTexts(html).at(-1), text)
      assert.match(html, /whitespace-pre-wrap/)
      assert.match(html, /overflow-auto/)
    }
  }
})

test('nested JSON-looking strings and literal script/path escapes are never parsed again', () => {
  const message = String.raw`{"literal":"one\ntwo"}`
  const path = String.raw`C:\new\tools\notes.txt`
  const text = JSON.stringify({ message, path, content: 'actual\nnewline' })
  assert.deepEqual(preTexts(render(ToolOutput, { output: text })), [message, path, 'actual\nnewline', text])
  const scalar = JSON.stringify(message)
  assert.deepEqual(preTexts(render(ToolOutput, { output: scalar })), [message, scalar])
})

test('root arrays, zero, false, null, empty strings and empty collections retain values and raw JSON', () => {
  for (const value of [0, false, null, '', {}, [], ['first\nsecond', 'third']]) {
    const output = JSON.stringify(value)
    const expected = Array.isArray(value) && value.length ? value : [typeof value === 'string' ? value : JSON.stringify(value)]
    assert.deepEqual(preTexts(render(ToolOutput, { output })), [...expected, output])
  }
})

test('plain text and incomplete streaming JSON fall back verbatim without guessing backslashes', () => {
  for (const text of ['line one\nline two', String.raw`line\ntext`, '{"message":"partial\\n', '', '{bad-json}']) {
    assert.deepEqual(toolDataDisplay(text), { parsed: false, text })
    assert.deepEqual(preTexts(render(ToolOutput, { output: text })), [text])
  }
})

test('HTML stays inert and prototype-looking field names have ordinary labels', () => {
  const text = '{"__proto__":"one\\ntwo","constructor":"<script>alert(1)</script>","toString":"<img src=x onerror=alert(1)>"}'
  const html = render(ToolOutput, { output: text })
  assert.doesNotMatch(html, /<(script|img)\b/)
  assert.deepEqual(preTexts(html), ['one\ntwo', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', text])
  for (const name of ['__proto__', 'constructor', 'toString']) assert.equal(toolFieldLabel(name), name)
})

test('large lists are collapsed until requested and deep descendants are not mounted eagerly', () => {
  const output = JSON.stringify(Array.from({ length: 125 }, (_, index) => `row ${index}\nbody`))
  const html = render(ToolOutput, { output })
  assert.match(html, /列表 · 125 项/)
  assert.deepEqual(preTexts(html), [output])
  assert.doesNotMatch(html, /<details\b[^>]*\bopen[ =]/)
  let value = 'deep\nleaf'
  for (let index = 0; index < 1000; index++) value = { nested: value }
  const text = JSON.stringify(value)
  assert.deepEqual(preTexts(render(ToolOutput, { output: text })), [text])
})

test('actual dialog panel uses the same field rendering for input, output and errors', () => {
  const input = JSON.stringify({ content: 'input\n  second' })
  const output = JSON.stringify({ message: 'output\n  second' })
  const error = JSON.stringify({ error: 'failure\n  reason' })
  const html = render(ChatDialogPanel, { assistantName: 'fixture', fontRatio: 1, onAdvance() {}, standaloneOverlay: false,
    currentOutput: { speaker: 'fixture', tool: { id: 'fixture', name: 'plugin_custom', status: 'error', input, output, error } } })
  assert.deepEqual(preTexts(html), ['input\n  second', input, 'output\n  second', output, 'failure\n  reason', error])
})

test('self-awake wrapped results preserve nested newlines without reinterpreting decoded strings', () => {
  const args = { reason: 'reason\n  second' }, value = { message: 'content\n  second', nested: { text: 'more\n  lines' } }
  const rawResult = { content: [{ type: 'text', text: JSON.stringify(value) }] }
  const execution = { id: 'fixture', name: 'plugin_custom', status: 'succeeded', result: '', args, rawResult }
  const html = render(SelfAwakeToolCard, { execution })
  assert.deepEqual(preTexts(html), [args.reason, JSON.stringify(args), value.message, value.nested.text,
    JSON.stringify(value), JSON.stringify(rawResult, null, 2)])
  const literal = String.raw`{"text":"keep\nthis"}`
  const stringHtml = render(SelfAwakeToolCard, { execution: { ...execution, rawResult: { content: [{ type: 'text', text: JSON.stringify(literal) }] } } })
  assert.ok(preTexts(stringHtml).includes(literal))
})
