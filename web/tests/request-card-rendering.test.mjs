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

test('desktop permission explains cross-window task scope and keeps host identifiers out of the decision', () => {
  const html = render(PermissionRequestCard, { request: { ...permission, permission: 'desktop.control',
    patterns: ['Windows 当前交互桌面'], always: ['desktop'], metadata: { task: 'private-task-reference', scope: '本任务可操作其他应用窗口' } }, onReply: unexpectedReply })
  assert.match(html, /操作本机桌面/); assert.match(html, /本任务可操作其他应用窗口/); assert.match(html, /允许本任务/)
  assert.doesNotMatch(html, /始终允许|private-task-reference|tool-1/)
})

test('question cards preserve empty-answer submission gating, option selection controls, and custom-answer policy', () => {
  for (const tone of ['default', 'overlay']) {
    const html = render(QuestionRequestCard, { request: question, onReply: unexpectedReply, onReject: unexpectedReply, tone })
    assert.equal((html.match(/aria-checked="false"/g) ?? []).length, 2)
    assert.doesNotMatch(html, /<input\b/)
    const submit = buttons(html).find(button => /type="submit"/.test(button[1]))
    const reject = buttons(html).find(button => button[2].includes('暂不处理'))
    assert.ok(submit && /\bdisabled=""/.test(submit[1]))
    assert.ok(reject && !/\bdisabled=""/.test(reject[1]))
    const custom = render(QuestionRequestCard, { request: { ...question, questions: [{ ...question.questions[0], custom: true }] },
      onReply: unexpectedReply, onReject: unexpectedReply, tone })
    assert.match(custom, /<textarea\b/)
    assert.match(custom, /maxLength="4000"/)
  }
})

test('the question overlay remains a focusable labelled modal form with explicit submission and rejection', () => {
  const html = render(QuestionDecisionOverlay, { request: question, onReply: unexpectedReply, onReject: unexpectedReply })
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  const dialogLabel = /role="dialog"[^>]*aria-labelledby="([^"]+)"/.exec(html)?.[1]
  assert.ok(dialogLabel && html.includes(`id="${dialogLabel}"`))
  assert.match(html, /tabindex="-1"/)
  assert.match(html, /问题确认，共 1 个问题/)
  assert.match(html, /<form\b/)
  assert.equal((html.match(/role="radio"/g) ?? []).length, 2)
  assert.doesNotMatch(html, /<textarea\b/)
  assert.ok(buttons(html).some(button => /type="submit"/.test(button[1]) && button[2].includes('还需回答 1 个问题') && /disabled/.test(button[1])))
  assert.ok(buttons(html).some(button => /type="button"/.test(button[1]) && button[2].includes('暂不处理')))
})

test('one, two and three questions expose the actual total, unique question navigation and independent section labels', () => {
  for (const count of [1, 2, 3]) {
    const request = { ...question, questions: Array.from({ length: count }, (_, index) => ({ ...question.questions[0], header: `分类 ${index}`, question: `第 ${index + 1} 个独立问题？`, multiple: index === 2 })) }
    for (const component of [QuestionRequestCard, QuestionDecisionOverlay]) {
      const html = render(component, { request, onReply: unexpectedReply, onReject: unexpectedReply })
      assert.match(html, new RegExp(`aria-label="本次共 ${count} 个问题"`))
      assert.equal((html.match(/data-question-index=/g) ?? []).length, count)
      assert.equal((html.match(/aria-controls=/g) ?? []).length, count)
      assert.match(html, new RegExp(`aria-valuenow="0" aria-valuemin="0" aria-valuemax="${count}"`))
      for (let index = 1; index <= count; index++) assert.ok(html.includes(`第 ${index} 题 / 共 ${count} 题`))
      if (count === 3) assert.equal((html.match(/role="checkbox"/g) ?? []).length, 2)
      assert.doesNotMatch(html, /已回答|工具调用:/, 'a draft is never presented as a committed answer')
    }
  }
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
