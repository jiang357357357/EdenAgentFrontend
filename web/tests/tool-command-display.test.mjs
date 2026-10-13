import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const [{ ToolCommandOutput }, { toolCommandDisplay }] = await Promise.all([
  vite.ssrLoadModule('/src/components/chat/message/ToolCommandOutput.tsx'),
  vite.ssrLoadModule('/src/lib/tool-command-display.ts'),
])
const tool = output => ({ id: 'fixture-command', name: 'exec_command', status: 'success', input: '{}', output })
const render = command => renderToStaticMarkup(createElement(ToolCommandOutput, { command }))
const decode = text => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const preTexts = html => [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)].map(match => decode(match[1]))

test('exec_command stdout and stderr decode real LF/CRLF and render separately, preserving raw JSON', () => {
  const stdout = '== 站点根目录 ==\nHTTP 200 24623 bytes\n== 夏莱页面 ==\nHTTP 200 29477 bytes text/html\n'
  const stderr = 'wsl: localhost 代理提示\r\n第二行\r\n'
  const output = JSON.stringify({ stdout, stderr, exitCode: 0 })
  const display = toolCommandDisplay(tool(output))
  assert.equal(display.exit_code, 0)
  assert.deepEqual(preTexts(render(display)), [stdout, stderr, output])
  assert.match(render(display), /aria-label="标准输出"/)
  assert.match(render(display), /aria-label="标准错误"/)
  assert.doesNotMatch(render(display), /<details\b[^>]*\bopen[ =]/)
})

test('one JSON decode preserves literal backslash escapes, quoted semicolons and Windows paths', () => {
  const stdout = String.raw`C:\new\tools\notes.txt; printf 'a\nb'` + '\nnext actual line'
  const output = JSON.stringify({ stdout, stderr: '', exitCode: 0 })
  assert.deepEqual(preTexts(render(toolCommandDisplay(tool(output)))), [stdout, output])
})

test('empty successful output and nonzero exit results keep their distinct exit codes', () => {
  const empty = toolCommandDisplay(tool(JSON.stringify({ stdout: '', stderr: '', exitCode: 0 })))
  assert.equal(empty.exit_code, 0)
  assert.match(render(empty), /无输出/)
  const failure = toolCommandDisplay(tool(JSON.stringify({ stdout: '', stderr: 'not found\n', exitCode: 127 })))
  assert.equal(failure.exit_code, 127)
  assert.deepEqual(preTexts(render(failure))[0], 'not found\n')
  assert.doesNotMatch(render(failure), /无输出/)
})

test('capture truncation is visible without inventing a character count', () => {
  const display = toolCommandDisplay(tool(JSON.stringify({ stdout: 'partial\n', stderr: '', exitCode: 0, outputTruncated: true })))
  assert.match(render(display), /输出已截断/)
  assert.match(render(display), /后续内容未显示/)
  assert.doesNotMatch(render(display), /0 个字符/)
})

test('unsupported, malformed and incomplete command results remain eligible for verbatim fallback', () => {
  for (const output of ['plain\\noutput', '{"stdout":"unfinished', '{}', 'null', '[]', '"first\\nsecond"',
    JSON.stringify({ stdout: [], stderr: '', exitCode: 0 }), JSON.stringify({ stdout: '', stderr: {}, exitCode: 0 }),
    JSON.stringify({ stdout: 'one', exitCode: 0 }), JSON.stringify({ stdout: '', stderr: '', exitCode: '0' })]) {
    assert.equal(toolCommandDisplay(tool(output)), undefined, output)
  }
  assert.equal(toolCommandDisplay({ ...tool('{"stdout":"a","stderr":"","exitCode":0}'), name: 'another_tool' }), undefined)
})

test('legacy bash, powershell and write_stdin details keep output, duration and truncation metadata', () => {
  for (const name of ['bash', 'powershell', 'write_stdin']) {
    const details = { command: 'echo first\necho second', cwd: '/workspace', session_id: 'fixture', status: 'running',
      exit_code: 1, stdout: 'first\nsecond\n', stderr: 'warning\n', duration_ms: 20, truncated: true, captured_chars: 42 }
    const display = toolCommandDisplay({ ...tool('legacy output'), name, details })
    assert.equal(display.command, details.command)
    assert.equal(display.cwd, '/workspace')
    assert.equal(display.exit_code, 1)
    assert.equal(display.duration_ms, 20)
    assert.deepEqual(preTexts(render(display)), [details.stdout, details.stderr])
    assert.match(render(display), /42 个字符/)
    assert.doesNotMatch(render(display), /原始结果/)
  }
})

test('malformed legacy metadata never becomes executable markup or invalid React children', () => {
  const display = toolCommandDisplay({ ...tool(''), name: 'bash', details: {
    stdout: {}, stderr: [], command: {}, cwd: [], exit_code: NaN, duration_ms: Infinity, captured_chars: {}, truncated: true,
  } })
  assert.equal(display.exit_code, undefined)
  assert.deepEqual(preTexts(render(display)), [])
  assert.match(render(display), /后续内容未显示/)
})

test('HTML output is inert text and long results remain complete in scrollable blocks', () => {
  const stdout = '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n'
    + Array.from({ length: 500 }, (_, index) => `line ${index}`).join('\n')
  const output = JSON.stringify({ stdout, stderr: '', exitCode: -1, extra: { reason: 'retained in raw result' } })
  const html = render(toolCommandDisplay(tool(output)))
  assert.doesNotMatch(html, /<(script|img)\b/)
  assert.deepEqual(preTexts(html), [stdout, output])
  assert.match(html, /overflow-auto/)
  assert.match(html, /whitespace-pre-wrap/)
})
