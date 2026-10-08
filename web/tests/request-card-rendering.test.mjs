import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const [{ PermissionRequestCard }, { QuestionRequestCard }, { QuestionDecisionOverlay }, { ToolCard }] = await Promise.all([
  vite.ssrLoadModule('/src/components/requests/PermissionRequestCard.tsx'),
  vite.ssrLoadModule('/src/components/requests/QuestionRequestCard.tsx'),
  vite.ssrLoadModule('/src/components/requests/QuestionDecisionOverlay.tsx'),
  vite.ssrLoadModule('/src/components/chat/message/ToolCard.tsx'),
])

const unexpectedReply = async () => { assert.fail('Rendering must not authorize or answer a request') }
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const buttons = html => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
const permission = { id: 'permission-1', permission: 'workspace.write', patterns: ['project/file.txt'],
  always: [], metadata: { path: 'project/file.txt', reason: '保存文件' }, tool: { callID: 'tool-1' } }
const question = { id: 'question-1', questions: [{ header: '保存位置', question: '保存到哪里？',
  options: [{ label: '项目目录', description: '当前项目' }, { label: '临时目录', description: '独立临时目录' }], custom: false }] }

test('both permission card variants preserve explicit decisions and only offer persistent authorization when permitted', () => {
  for (const tone of ['default', 'overlay']) {
    const html = render(PermissionRequestCard, { request: permission, onReply: unexpectedReply, tone })
    assert.match(html, /role="group"/)
    assert.match(html, /workspace\.write/)
    assert.match(html, /project\/file\.txt/)
    assert.match(html, /拒绝/)
    assert.match(html, /本次允许/)
    assert.doesNotMatch(html, /始终允许/)
    assert.equal(buttons(html).length, 2)
    assert.ok(buttons(html).every(button => /type="button"/.test(button[1]) && !/disabled/.test(button[1].replace(/class="[^"]*"/, ''))))
    const persistent = render(PermissionRequestCard, { request: { ...permission, always: ['project/*'] }, onReply: unexpectedReply, tone })
    assert.equal(buttons(persistent).length, 3)
    assert.match(persistent, /始终允许/)
  }
})

test('question cards preserve empty-answer submission gating, option selection controls, and custom-answer policy', () => {
  for (const tone of ['default', 'overlay']) {
    const html = render(QuestionRequestCard, { request: question, onReply: unexpectedReply, onReject: unexpectedReply, tone })
    assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2)
    assert.doesNotMatch(html, /<input\b/)
    const submit = buttons(html).find(button => button[2].includes('提交回答'))
    const reject = buttons(html).find(button => button[2].includes('暂不处理'))
    assert.ok(submit && /\bdisabled=""/.test(submit[1]))
    assert.ok(reject && !/\bdisabled=""/.test(reject[1]))
    const custom = render(QuestionRequestCard, { request: { ...question, questions: [{ ...question.questions[0], custom: true }] },
      onReply: unexpectedReply, onReject: unexpectedReply, tone })
    assert.match(custom, /<input\b[^>]*placeholder="自定义回答"/)
    assert.match(custom, /maxLength="4000"/)
  }
})

test('the question overlay remains a focusable labelled modal form with explicit submission and rejection', () => {
  const html = render(QuestionDecisionOverlay, { request: question, onReply: unexpectedReply, onReject: unexpectedReply })
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-labelledby="question-title-question-1"/)
  assert.match(html, /tabindex="-1"/)
  assert.match(html, /<legend[^>]*id="question-title-question-1"/)
  assert.match(html, /<form\b/)
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2)
  assert.doesNotMatch(html, /<textarea\b/)
  assert.ok(buttons(html).some(button => /type="submit"/.test(button[1]) && button[2].includes('确认选择')))
  assert.ok(buttons(html).some(button => /type="button"/.test(button[1]) && button[2].includes('暂不处理')))
})

test('tool cards remain collapsed controls and retain distinct running, success, failed, and aborted labels', () => {
  for (const [status, label] of [['running', '运行中'], ['success', '完成'], ['error', '失败'], ['aborted', '已中止']]) {
    const html = render(ToolCard, { tool: { id: 'tool-1', name: 'write_file', input: '{"path":"file.txt"}',
      status, output: 'private expanded result', error: status === 'error' ? 'private expanded error' : undefined } })
    assert.match(html, /aria-expanded="false"/)
    assert.match(html, /write_file/)
    assert.ok(html.includes(label))
    assert.doesNotMatch(html, /private expanded result|private expanded error/)
  }
})
