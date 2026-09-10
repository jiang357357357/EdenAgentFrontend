import test from 'node:test'
import assert from 'node:assert/strict'
import { selfAwakeModelRounds } from '../src/lib/self-awake-model-rounds.ts'
const event = (kind, payload) => ({ kind, payload })
test('groups several tools under one response and preserves the final text-only request', () => {
  const result = selfAwakeModelRounds({events:[
    event('model.request',{requestId:'one',model:'model'}),
    event('model.response',{requestId:'one'}),
    event('agent.tool_execution_start',{toolCallId:'a',toolName:'read'}),
    event('agent.tool_execution_start',{toolCallId:'b',toolName:'read'}),
    event('model.request',{requestId:'two',model:'model'}),
    event('model.response',{requestId:'two'}),
  ]})
  assert.deepEqual(result.rounds.map(r=>r.tools.length),[2,0])
})
test('does not invent a response association when evidence is missing', () => {
  const result = selfAwakeModelRounds({events:[event('model.request',{requestId:'one'}),event('agent.tool_execution_start',{toolCallId:'a'})]})
  assert.equal(result.rounds[0].responded,false)
  assert.equal(result.unassigned.length,1)
})
test('replayed request and tool events do not create duplicate cards or inflate counts', () => {
  const request=event('model.request',{requestId:'one',model:'model'})
  const start=event('agent.tool_execution_start',{toolCallId:'a',toolName:'read'})
  const result=selfAwakeModelRounds({events:[request,request,event('model.response',{requestId:'one'}),start,start]})
  assert.equal(result.rounds.length,1)
  assert.deepEqual(result.rounds[0].tools.map(call=>call.id),['a'])
})
test('tool completion without a start remains visible as unassigned evidence', () => {
  const result=selfAwakeModelRounds({events:[event('agent.tool_execution_end',{toolCallId:'a',toolName:'read',result:'done'})]})
  assert.equal(result.unassigned.length,1)
  assert.equal(result.unassigned[0].status,'succeeded')
  assert.equal(result.unassigned[0].name,'read')
})
