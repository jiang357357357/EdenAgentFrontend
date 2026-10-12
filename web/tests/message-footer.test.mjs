import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { replyCopyText } from '../src/lib/reply-copy.ts'

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const [{ MessageFooter, MessageDeleteConfirmation }, { MessageBubble }, reducer, transport] = await Promise.all([
  vite.ssrLoadModule('/src/components/chat/message/MessageFooter.tsx'),
  vite.ssrLoadModule('/src/components/chat/message/MessageBubble.tsx'),
  vite.ssrLoadModule('/src/lib/session-reducer.ts'),
  vite.ssrLoadModule('/src/lib/rpc-transport.ts'),
])
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const unexpected = () => assert.fail('Rendering must not copy or delete a reply')
const sessionID = 'session-1'
const message = id => ({ info: { id, role: 'assistant', time: { created: 1000, completed: 2000 } },
  parts: [{ id: `${id}-text`, messageID: id, sessionID, type: 'text', text: '回答正文' }] })

test('copy text preserves the answer Markdown and excludes thoughts, tools and other metadata', () => {
  assert.equal(replyCopyText({ content: '**完整回答**\n\n内容', segments: [] }), '**完整回答**\n\n内容')
  assert.equal(replyCopyText({ content: '', segments: [
    { type: 'thinking', content: 'private thought' }, { type: 'text', content: '第一段' },
    { type: 'tool', tool: { input: 'private parameters' } }, { type: 'text', content: '第二段' },
  ] }), '第一段\n\n第二段')
})

test('duration, copy and delete are adjacent controls and rendering never performs their actions', () => {
  const html = render(MessageFooter, { durationMs: 29300, text: '回答正文', onDelete: unexpected })
  assert.match(html, /耗时 29\.3 秒/)
  assert.match(html, /aria-label="复制回答"/)
  assert.match(html, /aria-label="删除回答"/)
  assert.doesNotMatch(html, /<dialog/)
  const unavailable = render(MessageFooter, { text: '', deleteDisabled: true, onDelete: unexpected })
  assert.equal((unavailable.match(/disabled=""/g) ?? []).length, 2)
})

test('confirmation card offers explicit cancel and delete, and pending deletion prevents duplicate decisions', () => {
  const html = render(MessageDeleteConfirmation, { onCancel: unexpected, onConfirm: unexpected })
  assert.match(html, /确定删除这条回答吗/)
  assert.match(html, /聊天记录和模型上下文/)
  assert.match(html, /用户输入保留/)
  assert.match(html, /取消/)
  assert.match(html, /已执行的操作不会撤销/)
  const pending = render(MessageDeleteConfirmation, { deleting: true, error: 'server unavailable', onCancel: unexpected, onConfirm: unexpected })
  assert.match(pending, /删除中/)
  assert.match(pending, /删除失败/)
  assert.match(pending, /server unavailable/)
  assert.equal((pending.match(/disabled=""/g) ?? []).length, 2)
})

test('completed assistant messages have actions even without timing; user and streaming messages do not', () => {
  const base = { id: 'answer', role: 'assistant', content: '正文', timestamp: '12:00', isStreaming: false }
  assert.match(render(MessageBubble, { message: base, onDeleteMessage: unexpected }), /aria-label="删除回答"/)
  for (const variant of [{ role: 'user' }, { isStreaming: true }]) {
    assert.doesNotMatch(render(MessageBubble, { message: { ...base, ...variant }, onDeleteMessage: unexpected }), /aria-label="(复制|删除)回答"/)
  }
})

test('persistent deletion survives late history, full message updates and part updates without affecting other answers', () => {
  const { runtimeReducer: reduce, initialRuntimeState, hydrateSessionMessages: hydrate, prependSessionMessages: prepend, applyRuntimeEvent: event } = reducer
  let state = reduce(initialRuntimeState, hydrate(sessionID, { items: [message('first'), message('second')], hasMore: false }))
  const deletion = transport.projectSessionEvent({ id: 'event', sessionId: sessionID, eventType: 'message.deleted', payload: { messageId: 'first' }, createdAt: 3000 })[0]
  state = reduce(state, event(deletion))
  for (const action of [hydrate(sessionID, { items: [message('first'), message('second')], hasMore: false }),
    prepend(sessionID, { items: [message('first')], hasMore: false }),
    event({ type: 'message.updated', properties: { sessionID, info: message('first').info } }),
    event({ type: 'message.part.updated', properties: { sessionID, part: message('first').parts[0] } }),
    event({ type: 'message.part.delta', properties: { sessionID, messageID: 'first', partID: 'first-text', field: 'text', delta: 'late' } }),
  ]) {
    state = reduce(state, action)
    assert.deepEqual(state.sessions[sessionID].messageOrder, ['second'])
    assert.equal(state.sessions[sessionID].messages.first, undefined)
  }
  assert.deepEqual(state.sessions[sessionID].deletedMessageIds, ['first'])
})

test('temporary retry removal does not create a permanent deletion marker', () => {
  const { runtimeReducer: reduce, initialRuntimeState, hydrateSessionMessages: hydrate, applyRuntimeEvent: event } = reducer
  let state = reduce(initialRuntimeState, hydrate(sessionID, { items: [message('first')], hasMore: false }))
  state = reduce(state, event({ type: 'message.removed', properties: { sessionID, messageID: 'first' } }))
  state = reduce(state, hydrate(sessionID, { items: [message('first')], hasMore: false }))
  assert.deepEqual(state.sessions[sessionID].messageOrder, ['first'])
  assert.equal(state.sessions[sessionID].deletedMessageIds, undefined)
})
