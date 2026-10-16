import assert from 'node:assert/strict'
import test from 'node:test'
import { sessionArchiveEvent, sessionArchiveState } from '../src/lib/session-archive-state.ts'

test('archive survives older list snapshots and replayed events and can be explicitly restored', () => {
  const archived = sessionArchiveState(undefined, true, 200)
  assert.equal(sessionArchiveState(archived, false, 100).archived, true)
  assert.equal(sessionArchiveState(archived, undefined, 300).archived, true)
  assert.equal(sessionArchiveState(archived, false, 201).archived, false)
  assert.equal(sessionArchiveState(undefined, undefined, 0).archived, false)
})

test('only validated archive events update a session property', () => {
  const event = { type: 'session.archive_updated', properties: { sessionID: 'second', archived: true, updatedAt: 200 } }
  assert.deepEqual(sessionArchiveEvent(event), event.properties)
  for (const properties of [null, {}, { ...event.properties, archived: 'true' }, { ...event.properties, updatedAt: NaN }])
    assert.equal(sessionArchiveEvent({ ...event, properties }), undefined)
  assert.equal(sessionArchiveEvent({ ...event, type: 'session.title_updated' }), undefined)
})
