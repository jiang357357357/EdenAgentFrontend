import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasConfiguredRuntimeModel, mapRuntimeModelCatalog, modelSelection } from '../src/lib/runtime-models.ts'

const option = id => ({ id: String(id), aiEntityId: id, label: `Model ${id}`, name: `Model ${id}`, provider: 'test', modelID: `model-${id}`, status: 'active', selected: false })
const catalogue = { source: 'core', serviceType: 'ai', vendors: {}, assistant: null, character: null,
  current: null, vision: null, options: [option(1), option(2)], director: option(1),
  actors: [{ assistantId: 10, assistantName: '甲', main: option(2) }, { assistantId: 20, assistantName: '乙', main: option(1) }] }

test('multi-actor catalogues tolerate null identities and preserve separate director and actor selections', () => {
  const config = mapRuntimeModelCatalog(catalogue)
  assert.equal(config.actors[0].name, '甲')
  assert.equal(config.current, null)
  const director = modelSelection(config, 'director')
  assert.deepEqual(director.target, { kind: 'director' })
  assert.deepEqual(director.options.map(item => item.selected), [true, false])
  const actor = modelSelection(config, 'actor:10')
  assert.deepEqual(actor.target, { kind: 'actor', assistantId: 10 })
  assert.deepEqual(actor.options.map(item => item.selected), [false, true])
  assert.deepEqual(config.options.map(item => item.selected), [false, false])
  assert.deepEqual(modelSelection(config, 'actor:missing').target, { kind: 'director' })
})

test('single-model catalogues keep untargeted selection and malformed actors cannot create targets', () => {
  const config = mapRuntimeModelCatalog({ ...catalogue, current: option(2), actors: [null, {}, { assistantId: 10, main: null }] })
  assert.equal(modelSelection(config, 'actor:10').target, undefined)
  assert.deepEqual(modelSelection(config, 'director').options.map(item => item.selected), [false, true])
})

test('a single-role session requires one usable current model', () => {
  assert.equal(hasConfiguredRuntimeModel(mapRuntimeModelCatalog({ ...catalogue, current: option(2), actors: [] })), true)
  assert.equal(hasConfiguredRuntimeModel(mapRuntimeModelCatalog({ ...catalogue, current: null, actors: [] })), false)
  assert.equal(hasConfiguredRuntimeModel({ source: 'env', current: { ...option(1), status: 'unavailable' }, options: [] }), false)
})

test('a multi-role session requires the director and every actor model', () => {
  const complete = mapRuntimeModelCatalog(catalogue)
  assert.equal(hasConfiguredRuntimeModel(complete), true)
  assert.equal(hasConfiguredRuntimeModel({ ...complete, director: null }), false)
  assert.equal(hasConfiguredRuntimeModel({ ...complete, actors: complete.actors.map((actor, index) => index === 0 ? { ...actor, current: null } : actor) }), false)
})
