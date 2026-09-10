import test from 'node:test'
import assert from 'node:assert/strict'
import { selfAwakeToolSummary } from '../src/lib/self-awake-tool-summary.ts'
const call = (name, value, args = {}, status = 'succeeded') => ({ id:'call',name,status,args,result:'',rawResult:{content:[{type:'text',text:JSON.stringify(value)}]} })
test('tool summaries decode wrapped JSON and distinguish query sections', () => {
  const diary = selfAwakeToolSummary(call('get_self_awake_context', {diaries:[{title:'one'}]}, {section:'recent_diaries'}))
  assert.equal(diary.title, '读取近期日记')
  assert.equal(diary.summary, '读取到 1 篇日记。')
  assert.equal(selfAwakeToolSummary(call('list_due_memos', [])).summary, '没有到期备忘。')
  assert.equal(selfAwakeToolSummary(call('list_memos', [])).summary, '没有匹配的备忘。')
})
test('unavailable, stale and failed results do not claim usable observations', () => {
  assert.equal(selfAwakeToolSummary(call('get_self_awake_context', {available:false}, {section:'desktop_session'})).summary, '当前没有可用数据。')
  assert.match(selfAwakeToolSummary(call('get_self_awake_context', {available:true,stale:true})).summary, /已过期/)
  assert.match(selfAwakeToolSummary(call('list_due_memos', [], {}, 'failed')).summary, /调用失败/)
})
test('timer summary uses returned due time, not requested delay', () => {
  const result = selfAwakeToolSummary(call('set_self_awake_timer', {dueAt:1789059600000}, {afterMinutes:5,reason:'检查回复'}))
  assert.match(result.summary,/下次自醒/)
  assert.match(result.summary,/检查回复/)
  assert.equal(result.decodedResult.dueAt,1789059600000)
  assert.doesNotMatch(selfAwakeToolSummary(call('set_self_awake_timer', {})).summary,/下次自醒：/)
})
