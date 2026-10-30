import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, deferred } from './fixtures/question-runtime-fixture.mjs'

const question = { id: 'decision', sessionID: 'A', questions: [{ header: '下一步', question: '继续执行吗？',
  options: [{ label: '继续', description: '继续任务' }], custom: true }] }
const ask = f => f.subscriptions.at(-1).onEvent({ type: 'question.asked', properties: question })
const answer = f => f.subscriptions.at(-1).onEvent({ type: 'question.replied', properties: { sessionID: 'A', requestID: question.id, answers: [['继续']] } })

test('an old pending snapshot cannot clear a question delivered while the query was running', async () => {
  const f = fixture(), { host } = f, query = deferred()
  try {
    await host.settle(); await f.open()
    f.rpc.listQuestionsRaw = () => query.promise
    await f.reconnect()
    ask(f); await host.settle()
    assert.equal(host.value.allPendingQuestions.length, 1)
    query.resolve([]); await host.settle()
    assert.equal(host.value.allPendingQuestions.length, 1)
  } finally { host.dispose() }
})

test('a stale pending snapshot cannot resurrect a question resolved by a live event', async () => {
  const f = fixture(), { host } = f, query = deferred()
  try {
    await host.settle(); await f.open(); ask(f); await host.settle()
    f.rpc.listQuestionsRaw = () => query.promise
    await f.reconnect(); answer(f); await host.settle()
    query.resolve([question]); await host.settle()
    assert.equal(host.value.allPendingQuestions.length, 0)
  } finally { host.dispose() }
})

test('camera and permission failures cannot block a successful question snapshot or its retry', async () => {
  const f = fixture(), { host } = f
  try {
    await host.settle(); await f.open()
    f.rpc.listQuestionsRaw = async () => [question]
    f.rpc.listCameraCaptureRequests = async () => { throw new Error('camera unavailable') }
    f.rpc.listPermissionsRaw = async () => { throw new Error('permissions unavailable') }
    await f.reconnect()
    assert.equal(host.value.allPendingQuestions.length, 1)
    assert.equal(host.value.questionSyncError, undefined)
    f.rpc.listQuestionsRaw = async () => { throw new Error('question query failed') }
    await assert.rejects(host.value.refreshQuestions(), /question query failed/)
    await host.settle()
    assert.equal(host.value.allPendingQuestions.length, 1, 'failure retains the current decision')
    assert.equal(host.value.questionSyncError, 'question query failed')
    f.rpc.listQuestionsRaw = async () => []
    await host.value.refreshQuestions(); await host.settle()
    assert.equal(host.value.questionSyncError, undefined)
    assert.equal(host.value.allPendingQuestions.length, 0)
  } finally { host.dispose() }
})

test('a stalled camera query does not delay question display', async () => {
  const f = fixture(), { host } = f, camera = deferred()
  try {
    await host.settle(); await f.open()
    f.rpc.listQuestionsRaw = async () => [question]
    f.rpc.listCameraCaptureRequests = () => camera.promise
    await f.reconnect()
    assert.equal(host.value.allPendingQuestions.length, 1)
    assert.equal(host.value.questionsLoading, false)
    camera.resolve([]); await host.settle()
  } finally { host.dispose() }
})

test('individual session reconnect reloads questions even when message restoration fails', async () => {
  const f = fixture(), { host } = f
  try {
    await host.settle(); await f.open()
    f.rpc.listQuestionsRaw = async () => [question]
    f.rpc.listMessagesRaw = async () => { throw new Error('message read failed') }
    for (const callback of f.channelListeners) callback({ sessionId: 'A', connected: false, error: 'disconnected' })
    await host.settle()
    for (const callback of f.channelListeners) callback({ sessionId: 'A', connected: true })
    await host.settle()
    assert.equal(host.value.allPendingQuestions.length, 1)
  } finally { host.dispose() }
})

test('accepted answers clear the decision without waiting for an event and cannot be undone by an older query', async () => {
  const f = fixture(), { host } = f, query = deferred(), calls = []
  try {
    await host.settle(); await f.open(); ask(f); await host.settle()
    f.rpc.listQuestionsRaw = () => query.promise
    await f.reconnect()
    f.rpc.replyQuestion = async (...args) => { calls.push(args) }
    await host.value.answerQuestion(question.id, [['继续']], ['说明']); await host.settle()
    assert.equal(host.value.allPendingQuestions.length, 0)
    query.resolve([question]); await host.settle()
    assert.equal(host.value.allPendingQuestions.length, 0)
    assert.deepEqual(calls, [[question.id, [['继续']], ['说明']]])
  } finally { host.dispose() }
})

test('a pending snapshot from a reset world cannot repopulate questions or error state', async () => {
  const f = fixture(), { host } = f, query = deferred()
  try {
    await host.settle(); await f.open()
    f.rpc.listQuestionsRaw = () => query.promise
    await f.reconnect()
    host.value.reset()
    f.rpc.listQuestionsRaw = async () => []
    await host.settle(); await f.open()
    query.resolve([question]); await host.settle()
    assert.equal(host.value.allPendingQuestions.length, 0)
    assert.equal(host.value.questionSyncError, undefined)
  } finally { host.dispose() }
})
