import assert from 'node:assert/strict'
import test from 'node:test'
import { selfAwakeObservations, selfAwakeToolExecutions } from '../src/lib/self-awake-context.ts'

test('persisted tool events expose only actual executions and results', () => {
  const calls = selfAwakeToolExecutions({events:[
    {eventType:'agent.tool_execution_start',payload:{toolCallId:'call-1',toolName:'get_self_awake_context'}},
    {eventType:'agent.tool_execution_end',payload:{toolCallId:'call-1',result:{status:'ok',items:2},isError:false}},
    {eventType:'turn.completed',payload:{}},
  ]})
  assert.deepEqual(calls, [{id:'call-1',name:'get_self_awake_context',status:'succeeded',result:'{"status":"ok","items":2}'}])
})
test('failed, pending and missing execution events are represented honestly', () => {
  assert.deepEqual(selfAwakeToolExecutions(null), [])
  assert.deepEqual(selfAwakeToolExecutions({events:[
    {event_type:'agent.tool_execution_start',payload:{tool_call_id:'pending',tool_name:'check'}},
    {event_type:'agent.tool_execution_end',payload:{tool_call_id:'failed',tool_name:'lookup',error:'denied',is_error:true}},
  ]}), [
    {id:'pending',name:'check',status:'running',result:'执行中'},
    {id:'failed',name:'未知工具',status:'failed',result:'denied'},
  ])
})
test('observations remain visible when no diary was written', () => {
  assert.deepEqual(selfAwakeObservations({action:'observe_only',diary:null,observations:['事实一','',null,5]}), ['事实一'])
  assert.deepEqual(selfAwakeObservations(null), [])
})
