import assert from 'node:assert/strict'
import test from 'node:test'
import { selfAwakeActivity, selfAwakeObservations } from '../src/lib/self-awake-context.ts'

test('native request and Core presence envelopes expose captured facts', () => {
  const facts = { system_input: {idle_seconds: 223}, session: {locked: false}, foreground_window: {application_name:'code'}, captured_at:'2026-09-08T12:36:16+08:00' }
  assert.deepEqual(selfAwakeActivity({trigger:{user_activity:{available:true,payload:facts}}}), facts)
  assert.deepEqual(selfAwakeActivity({user_activity:facts}), facts)
})
test('missing and unavailable facts never invent idle or lock values', () => {
  assert.equal(selfAwakeActivity(null).system_input, undefined)
  assert.deepEqual(selfAwakeActivity({trigger:{user_activity:{available:false,payload:{session:{locked:false}}}}}), {available:false})
})
test('observations remain visible when no diary was written', () => {
  assert.deepEqual(selfAwakeObservations({action:'observe_only',diary:null,observations:['事实一','',null,5]}), ['事实一'])
  assert.deepEqual(selfAwakeObservations(null), [])
})
