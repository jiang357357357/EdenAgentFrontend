import test from 'node:test'
import assert from 'node:assert/strict'
import { contextSections } from '../src/lib/context-sections.ts'

test('source categories, individual tool calls and results remain inspectable', () => {
 const sections = contextSections({ contextSources: [
  { kind: 'character', title: '角色', content: { profile: { personality: 'calm', name: 'fixture' } } },
  { kind: 'memory', title: '记忆', content: 'remembered' },
 ], payload: { messages: [
  { role: 'system', content: 'combined' }, { role: 'user', content: 'question' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'call', function: { name: 'lookup', arguments: '{"id":1}' } }] },
  { role: 'tool', tool_call_id: 'call', content: 'result' },
 ], tools: [{ type: 'function', function: { name: 'lookup', description: 'Search', parameters: { type: 'object' } } }] } })
 assert.deepEqual(sections.find(s => s.title === '角色人设').items.map(item => item.title), ['fixture · 基础资料', 'fixture · 性格', 'fixture · 完整角色资料'])
 assert.equal(sections.find(s => s.title === '工具定义').items[0].title, 'lookup')
 const history = sections.find(s => s.title === '对话历史与工具交互')
 assert.ok(history.items.some(i => i.title.includes('工具调用') && i.value.id === 'call'))
 assert.ok(history.items.some(i => i.title.includes('工具结果') && i.value === 'result'))
 assert.equal(sections.find(s => s.title === '本次请求输入').items[0].value, 'question')
})
test('unknown legacy system text is never guessed into a character category', () => {
 const sections = contextSections({ payload: { messages: [{role: 'system', content: 'pretend this is a character'}] } })
 assert.equal(sections.length, 1)
 assert.match(sections[0].title, /未记录来源/)
})

 test('large nested character arrays stay intact without exploding the visible item count', () => {
   const content = [{ assistantId: 21, assistantName: 'fixture', profile: { character: {
     personality: 'calm', social_relations: ['friend', 'teacher'],
     assets: Array.from({length: 1800}, (_, i) => ({id: i, nested: {values: [1, 2, 3]}})),
   } } }]
   const items = contextSections({contextSources: [{kind: 'character', content}]}).find(s => s.title === '角色人设').items
   assert.equal(items.length, 4)
   assert.deepEqual(items.find(item => item.title.endsWith('人际关系')).value, ['friend', 'teacher'])
   assert.deepEqual(items.find(item => item.title.endsWith('完整角色资料')).value, content[0])
   assert.equal(items.some(item => item.title.includes('assistantId')), false)
 })
