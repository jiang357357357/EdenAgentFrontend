import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ModelMenuController } from '../src/lib/model-menu-controller.ts'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const config = label => ({ source: 'core', options: [], label })
const option = { id: '2', aiEntityId: 2, selected: false }

test('a delayed refresh cannot replace a newer catalogue or a completed selection', async () => {
  const reads = [deferred(), deferred(), deferred()]
  const save = deferred()
  let count = 0
  const calls = []
  const controller = new ModelMenuController({ load: () => reads[count++].promise,
    save: (...args) => { calls.push(args); return save.promise } }, 'session-one')
  const old = controller.refresh()
  const newer = controller.refresh()
  reads[1].resolve(config('new')); await newer
  reads[0].resolve(config('old')); await old
  assert.equal(controller.snapshot().config.label, 'new')
  const beforeSave = controller.refresh()
  const selected = controller.select(option, { kind: 'actor', assistantId: 20 })
  assert.equal(await controller.select(option), false)
  await controller.refresh()
  assert.equal(count, 3)
  assert.deepEqual(calls, [[2, 'session-one', { kind: 'actor', assistantId: 20 }]])
  save.resolve(config('saved')); assert.equal(await selected, true)
  reads[2].reject(new Error('stale read failure')); await beforeSave
  assert.equal(controller.snapshot().config.label, 'saved')
  assert.equal(controller.snapshot().error, null)
  assert.equal(controller.snapshot().submitting, null)
})

test('a completed mutation from a departed session cannot close or populate the next session menu', async () => {
  const saved = deferred()
  const previous = new ModelMenuController({ load: async () => config('old'), save: () => saved.promise }, 'previous')
  const pending = previous.select(option, { kind: 'director' })
  previous.deactivate()
  const next = new ModelMenuController({ load: async () => config('next'), save: async () => config('next saved') }, 'next')
  await next.refresh()
  saved.resolve(config('old saved'))
  assert.equal(await pending, false)
  assert.equal(previous.snapshot().config, null)
  assert.equal(next.snapshot().config.label, 'next')
})

test('reactivation waits for an existing mutation and then refreshes confirmed remote state', async () => {
  const saved = deferred()
  let writes = 0, reads = 0
  const controller = new ModelMenuController({ load: async () => { reads++; return config('confirmed') },
    save: () => { writes++; return saved.promise } }, 'same-session')
  const pending = controller.select(option)
  controller.deactivate(); controller.activate()
  await controller.refresh()
  assert.equal(await controller.select(option), false)
  assert.equal(reads, 0)
  assert.equal(writes, 1)
  saved.resolve(config('old render'))
  assert.equal(await pending, false)
  await Promise.resolve()
  assert.equal(reads, 1)
  assert.equal(controller.snapshot().config.label, 'confirmed')
})
