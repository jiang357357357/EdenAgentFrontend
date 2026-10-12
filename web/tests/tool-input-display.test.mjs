import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { toolInputDisplay, toolInputPreview } from '../src/lib/tool-input-display.ts'

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const [{ ToolParameters }, { ToolCard }] = await Promise.all([
  vite.ssrLoadModule('/src/components/chat/message/ToolParameters.tsx'),
  vite.ssrLoadModule('/src/components/chat/message/ToolCard.tsx'),
])
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const decode = text => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const preTexts = html => [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)].map(match => decode(match[1]))

test('multiline exec_command parameters render decoded commands and separate fields, with original JSON available', () => {
  const command = `WS=/mnt/e/EDEN/Agent/workspace\ncd "$WS"\npython3 - <<'PY'\nprint("中文")\nPY`
  const input = JSON.stringify({ command, workdir: '/mnt/e/EDEN/Agent', timeout_ms: 30000 }, null, 2)
  const html = render(ToolParameters, { input })
  assert.match(html, /工具参数/)
  assert.match(html, /命令/)
  assert.match(html, /工作目录/)
  assert.deepEqual(preTexts(html), [command, '/mnt/e/EDEN/Agent', '30000', input])
  assert.match(html, /<details\b[^>]*><summary/)
  assert.doesNotMatch(html, /<details\b[^>]*\bopen[ =]/)
})

test('JSON is decoded once, preserving Windows paths and literal script escape sequences', () => {
  const command = String.raw`node -e "console.log('a\nb'); const p = 'C:\\new\\tools'"` + '\nnext-command'
  const path = String.raw`C:\new\tools\notes.txt`
  const input = JSON.stringify({ command, path })
  const display = toolInputDisplay(input)
  assert.equal(display.kind, 'fields')
  assert.equal(display.fields[0].text, command)
  assert.equal(display.fields[1].text, path)
  assert.deepEqual(preTexts(render(ToolParameters, { input })), [command, path, input])
})

test('false, zero, null, nested objects and unknown field names remain available', () => {
  const args = { zero: 0, enabled: false, optional: null, content: '', queries: ['中文', 'test'],
    params: { action: 'inspect', depth: 2 }, constructor: 'business field', toString: 'plain value' }
  const input = JSON.stringify(args)
  const display = toolInputDisplay(input)
  assert.equal(display.kind, 'fields')
  for (const field of display.fields) {
    assert.equal(field.text, typeof args[field.name] === 'string' ? args[field.name] : JSON.stringify(args[field.name], null, 2))
    assert.equal(typeof field.label, 'string')
  }
  assert.deepEqual(preTexts(render(ToolParameters, { input })), [...display.fields.map(field => field.text), input])
})

test('incomplete, invalid or plain input is rendered verbatim without guessing escaped newlines', () => {
  for (const input of ['{"command":"echo \\n', String.raw`plain\ncommand`, '', '{bad-json}']) {
    assert.deepEqual(toolInputDisplay(input), { kind: 'text', text: input })
    assert.deepEqual(preTexts(render(ToolParameters, { input })), [input])
  }
})

test('non-object JSON inputs preserve their values and empty argument objects remain visible', () => {
  for (const value of [{}, [], ['one', 'two'], null, false, 0, 'first\nsecond']) {
    const input = JSON.stringify(value)
    const expected = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    assert.deepEqual(toolInputDisplay(input), { kind: 'text', text: expected })
    assert.deepEqual(preTexts(render(ToolParameters, { input })), [expected])
  }
})

test('HTML in tool arguments remains inert text', () => {
  const content = '<script>alert("x")</script>\n<img src=x onerror="alert(1)">'
  const input = JSON.stringify({ content })
  const html = render(ToolParameters, { input })
  assert.doesNotMatch(html, /<(script|img)\b/)
  assert.deepEqual(preTexts(html), [content, input])
})

test('collapsed cards show a compact command instead of its serialized argument wrapper', () => {
  const input = JSON.stringify({ timeout_ms: 30000, command: 'cd /workspace\nnode app.js' })
  assert.equal(toolInputPreview(input), 'cd /workspace node app.js')
  assert.equal(toolInputPreview('{"path":"file.txt"}'), '路径: file.txt')
  const html = render(ToolCard, { tool: { id: 'tool-1', name: 'exec_command', status: 'success', input } })
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /exec_command/)
  assert.match(html, /cd \/workspace node app\.js/)
  assert.doesNotMatch(html, /timeout_ms|工具参数|&quot;command&quot;|\\n/)
})

test('long scripts remain complete in the scrollable parameter view while only the preview is shortened', () => {
  const command = Array.from({ length: 300 }, (_, i) => `echo "line ${i}"`).join('\n')
  const input = JSON.stringify({ command })
  assert.ok(toolInputPreview(input).length <= 240)
  assert.deepEqual(preTexts(render(ToolParameters, { input })), [command, input])
})
