import assert from 'node:assert/strict'
import test from 'node:test'
import { subscribeWorkspaceScope } from '../src/lib/workspace-scope-events.ts'

test('folder changes retire only the owning previews; account changes retire all scopes', () => {
  const events = new EventTarget(), resets = { a: 0, b: 0, global: 0 }
  const dispose = [
    subscribeWorkspaceScope(events, 'A', () => resets.a++),
    subscribeWorkspaceScope(events, 'B', () => resets.b++),
    subscribeWorkspaceScope(events, undefined, () => resets.global++),
  ]
  const emit = detail => events.dispatchEvent(new CustomEvent('edenagent:workspace-changed', { detail }))
  emit({ sessionId: 'A' })
  assert.deepEqual(resets, { a: 1, b: 0, global: 0 })
  emit({ sessionID: 'B' })
  emit({})
  assert.deepEqual(resets, { a: 1, b: 1, global: 0 })
  events.dispatchEvent(new Event('edenagent:account-changed'))
  assert.deepEqual(resets, { a: 2, b: 2, global: 1 })
  dispose.forEach(stop => stop())
  emit({ sessionId: 'A' })
  events.dispatchEvent(new Event('edenagent:account-changed'))
  assert.deepEqual(resets, { a: 2, b: 2, global: 1 })
})
