import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false } })
after(() => vite.close())
const { questionMatchesTool, unplacedQuestions, questionAnswers } = await vite.ssrLoadModule('/src/lib/question-tool-state.ts')
const { projectSessionEvent } = await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
const question = { id: 'question', sessionID: 'A', turnID: 'turn-A', toolCallID: 'call', questions: [] }
const tool = { id: 'call', name: 'request_user_input', status: 'running', input: '{}' }
const message = { id: 'message', runID: 'turn-A', role: 'assistant', content: '', timestamp: '', toolCalls: [tool] }

test('pending questions match only their exact session, invocation and available turn identity', () => {
  assert.equal(questionMatchesTool(question, 'A', 'call', 'message', 'turn-A'), true)
  assert.equal(questionMatchesTool(question, 'B', 'call', 'message', 'turn-A'), false)
  assert.equal(questionMatchesTool(question, 'A', 'other', 'message', 'turn-A'), false)
  assert.equal(questionMatchesTool(question, 'A', 'call', 'message', 'turn-B'), false)
  assert.equal(questionMatchesTool({ ...question, toolCallID: undefined }, 'A', 'call'), false)
  const legacy = { ...question, toolCallID: undefined, tool: { callID: 'call', messageID: 'message' } }
  assert.equal(questionMatchesTool(legacy, 'A', 'call', 'message'), true)
  assert.equal(questionMatchesTool(legacy, 'A', 'call', 'wrong-message'), false)
})

test('missing and unloaded tool messages keep an in-conversation answer path without duplicate forms', () => {
  assert.deepEqual(unplacedQuestions([question], 'A', [message]), [])
  assert.deepEqual(unplacedQuestions([question], 'A', [{ ...message, segments: [] }]), [])
  assert.deepEqual(unplacedQuestions([question], 'A', [{ ...message, toolCalls: undefined, segments: [{ id: 'segment', type: 'tool', tool }] }]), [])
  assert.deepEqual(unplacedQuestions([question], 'A', []), [question])
  assert.deepEqual(unplacedQuestions([question], 'B', [message]), [])
  assert.deepEqual(unplacedQuestions([question], 'A', [{ ...message, role: 'user' }]), [question])
  const old = { ...question, toolCallID: undefined }
  assert.deepEqual(unplacedQuestions([old], 'A', [message]), [old], 'old metadata is never guessed from the tool name')
})

test('answer summaries use only actual completed tool receipts and preserve supplementary text', () => {
  const completed = { ...tool, status: 'success', input: JSON.stringify({ questions: [{ question: '继续吗？' }] }), output: JSON.stringify({ answers: [['继续', '先核对路径\n再执行']] }) }
  assert.deepEqual(questionAnswers(completed), [{ question: '继续吗？', answers: ['继续', '先核对路径\n再执行'] }])
  assert.deepEqual(questionAnswers({ ...completed, status: 'running' }), [])
  assert.deepEqual(questionAnswers({ ...completed, status: 'error' }), [])
  assert.deepEqual(questionAnswers({ ...completed, name: 'read_file' }), [])
  for (const output of ['not-json', '{}', '{"answers":[]}', '{"answers":[[3]]}', '{"answers":[["继续"],[]]}']) assert.deepEqual(questionAnswers({ ...completed, output }), [])
})

test('live question projection carries the same durable invocation identity as the backend snapshot', () => {
  const payload = { id: 'question', sessionId: 'A', turnId: 'turn-A', toolCallId: 'call', questions: [] }
  const events = projectSessionEvent({ id: 'event', sessionId: 'A', turnId: 'turn-A', seq: 1, eventType: 'question.requested', payload, createdAt: 1 })
  assert.equal(events[0].properties.toolCallID, 'call')
  assert.equal(events[0].properties.turnID, 'turn-A')
  assert.equal(questionMatchesTool(events[0].properties, 'A', 'call', 'message', 'turn-A'), true)
})
