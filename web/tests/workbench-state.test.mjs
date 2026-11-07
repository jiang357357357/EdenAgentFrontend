import assert from 'node:assert/strict'
import test from 'node:test'
import { initialWorkbench, restoreWorkbench, workbenchReducer as reduce } from '../src/components/workbench/workbench-state.ts'
import { applicationPageTitles } from '../src/components/workbench/application-pages.ts'
const chat = id => ({ id: `chat:${id}`, kind: 'chat', sessionId: id, title: id })
const plugin = { id: 'plugin:ledger', kind: 'plugin', viewKey: 'ledger/main', title: '记账本' }
test('moving one conversation leaves the other conversation and its editor selection independent', () => {
  let state = reduce(initialWorkbench(), { type: 'open', document: chat('a') })
  state = reduce(state, { type: 'open', document: chat('b') })
  state = reduce(state, { type: 'open', document: plugin })
  state = reduce(state, { type: 'move', id: 'chat:a', group: 'auxiliary' })
  assert.equal(state.tabs.find(tab=>tab.id==='chat:a').group,'auxiliary')
  assert.equal(state.tabs.find(tab=>tab.id==='chat:b').group,'main')
  assert.equal(state.active.main, plugin.id)
  assert.equal(state.active.auxiliary, 'chat:a')
  state = reduce(state, { type: 'close', id: 'chat:a' })
  assert.equal(state.active.auxiliary, null)
  assert.equal(state.tabs.find(tab=>tab.id==='chat:b').group,'main')
})
test('closing, reordering and restoring editors preserves valid group selection and sizes', () => {
  let state = reduce(initialWorkbench(), { type: 'open', document: chat('a') })
  state = reduce(state, { type: 'open', document: plugin })
  state = reduce(state, { type: 'move', id: plugin.id, group: 'main', before: 'chat:a' })
  state = reduce(state, { type: 'layout', patch: { sideWidth: 512, bottomOpen: true } })
  assert.deepEqual(restoreWorkbench(JSON.stringify(state)), state)
  assert.deepEqual(state.tabs.map(tab => tab.id), [plugin.id, 'chat:a'])
  state = reduce(state, { type: 'close', id: plugin.id })
  assert.equal(state.active.main, 'chat:a')
})
test('corrupt and untrusted saved layouts cannot create unknown document kinds, duplicate editors or extreme sizes', () => {
  assert.deepEqual(restoreWorkbench('{'), initialWorkbench())
  const state = restoreWorkbench(JSON.stringify({ ...initialWorkbench(), sidebarWidth: -90, sideWidth: 1e20,
    active: { main: 'missing', auxiliary: {} }, tabs: [{ ...chat('a'), group: 'main' }, { ...chat('a'), group: 'main' },
      { ...plugin, group: 'auxiliary' }, { id: 'x', title: 'x', kind: 'execute', group: 'main' }] }))
  assert.equal(state.tabs.length, 2)
  assert.equal(state.sidebarWidth, 220)
  assert.equal(state.sideWidth, 800)
  assert.equal(state.active.main, 'chat:a')
  assert.equal(state.active.auxiliary, plugin.id)
})
test('recursive horizontal and vertical groups survive restoration and merging without losing documents',()=>{
  let state=reduce(initialWorkbench(),{type:'open',document:chat('a')})
  state=reduce(state,{type:'split',group:'main',axis:'horizontal',id:'chat:a'})
  state=reduce(state,{type:'split',group:'editor-1',axis:'vertical'})
  assert.equal(state.layout.children[1].axis,'vertical')
  state=reduce(state,{type:'resize',id:'split:editor-1',ratio:.63})
  assert.deepEqual(restoreWorkbench(JSON.stringify(state)),state)
  state=reduce(state,{type:'merge',group:'editor-1'})
  assert.ok(state.tabs.some(tab=>tab.id==='chat:a'))
  assert.equal(state.tabs[0].group,'main')
})
test('schema 1 migrates side tabs into a separate tool container and freezes plugin session scope',()=>{
  const state=restoreWorkbench(JSON.stringify({version:1,tabs:[{...chat('a'),group:'side'},{...plugin,group:'main'}],active:{main:plugin.id,side:'chat:a'},focused:'main'}))
  assert.equal(state.version,2)
  assert.equal(state.layout.type,'group')
  assert.equal(state.tabs[0].group,'auxiliary')
  assert.equal(state.tabs[1].sessionId,'a')
})
test('changing a session workspace removes only files bound to that session', () => {
  let state = reduce(initialWorkbench(), { type: 'open', document: plugin })
  for (const id of ['a', 'b']) state = reduce(state, { type: 'open', document: { id, kind: 'file', title: id, path: 'same.txt', sessionId: id } })
  state = reduce(state, { type: 'removeFiles', sessionId: 'a' })
  assert.deepEqual(state.tabs.map(tab => tab.id), [plugin.id, 'b'])
})

test('application pages cannot open or replace split documents, and old application tabs are discarded without losing chats',()=>{
  let state=reduce(initialWorkbench(),{type:'open',document:chat('a')})
  state=reduce(state,{type:'split',group:'main',axis:'horizontal'})
  for(const [page,title] of Object.entries(applicationPageTitles)) {
    const document={id:'page:'+page,kind:'page',page,title}
    assert.equal(reduce(state,{type:'open',document}),state)
    assert.equal(reduce(state,{type:'replace',id:'chat:a',document}),state)
  }
  const restored=restoreWorkbench(JSON.stringify({...state,tabs:[...state.tabs,{id:'page:selfAwake',kind:'page',page:'selfAwake',title:'自醒',group:'editor-1'}],
    active:{...state.active,'editor-1':'page:selfAwake'}}))
  assert.deepEqual(restored.layout,state.layout)
  assert.deepEqual(restored.tabs,state.tabs)
  assert.equal(restored.active['editor-1'],null)
  const portrait=reduce(restored,{type:'open',document:{id:'page:character',kind:'page',page:'character',title:'角色立绘'},group:'auxiliary'})
  assert.equal(portrait.tabs.at(-1).page,'character')
})
