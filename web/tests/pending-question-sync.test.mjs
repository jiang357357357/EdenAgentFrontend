import assert from 'node:assert/strict'
import { test } from 'node:test'
import { after } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const { PendingQuestionSync } = await vite.ssrLoadModule('/src/lib/pending-question-sync.ts')
const question = id => ({ id, sessionID: 'A', questions: [{ question: id, options: [], custom: true }] })
const asked = value => ({ type: 'question.asked', properties: value })
const resolved = id => ({ type: 'question.replied', properties: { sessionID: 'A', requestID: id } })

test('query snapshots retain live additions, removals and unaffected pending questions together', () => {
  const sync = new PendingQuestionSync(), snapshot = sync.begin()
  sync.event(asked(question('new')))
  sync.event(resolved('answered'))
  const result = sync.finish(snapshot, [question('answered'), question('existing')])
  assert.deepEqual(result.map(value => value.id).sort(), ['existing', 'new'])
})

test('a late older query cannot overwrite a newer successful authoritative query', () => {
  const sync = new PendingQuestionSync(), first = sync.begin(), second = sync.begin()
  assert.deepEqual(sync.finish(second, [question('latest')]).map(value => value.id), ['latest'])
  assert.equal(sync.finish(first, [question('stale')]), undefined)
})

test('overlapping queries retain only the changes occurring after their own start', () => {
  const sync = new PendingQuestionSync(), first = sync.begin()
  sync.event(asked(question('first-event')))
  const second = sync.begin()
  sync.event(resolved('first-event'))
  sync.event(asked(question('second-event')))
  assert.deepEqual(sync.finish(first, []).map(value => value.id), ['second-event'])
  assert.deepEqual(sync.finish(second, [question('first-event')]).map(value => value.id), ['second-event'])
})

test('failed queries and account instances do not discard changes needed by another running query', () => {
  const sync = new PendingQuestionSync(), first = sync.begin(), failed = sync.begin()
  sync.resolved('answered')
  sync.cancel(failed)
  assert.deepEqual(sync.finish(first, [question('answered')]), [])
  const otherAccount = new PendingQuestionSync(), fresh = otherAccount.begin()
  assert.deepEqual(otherAccount.finish(fresh, [question('answered')]).map(value => value.id), ['answered'])
})
