import assert from 'node:assert/strict'
import test from 'node:test'
import { pluginUiDocumentSchema } from '@eden/api'
import { initialWorkbench, restoreWorkbench, workbenchReducer as reduce } from '../src/components/workbench/workbench-state.ts'

const view=slot=>({id:'main',title:'Presentation',slot,entry:'view.html',...(slot==='tool_card'?{toolNames:['read_file']}:{})})
test('API 2 accepts six declared presentation types while API 1 retains its original contract',()=>{
  for(const slot of ['page','sidebar_panel','bottom_panel','full_page','floating_window','tool_card']) {
    assert.equal(pluginUiDocumentSchema.parse({schemaVersion:1,type:'module',apiVersion:2,entry:'extension.js',views:[view(slot)]}).views[0].slot,slot)
  }
  for(const slot of ['full_page','bottom_panel','floating_window'])assert.equal(pluginUiDocumentSchema.safeParse({schemaVersion:1,type:'module',apiVersion:1,entry:'client.js',views:[{id:'main',title:'View',slot}]}).success,false)
  assert.equal(pluginUiDocumentSchema.safeParse({schemaVersion:1,type:'module',apiVersion:2,entry:'extension.js',views:[{...view('tool_card'),toolNames:[]}]}).success,false)
  assert.equal(pluginUiDocumentSchema.safeParse({schemaVersion:1,type:'module',apiVersion:2,entry:'extension.js',capabilities:{documents:true},views:[{...view('floating_window'),renderer:'editor',filePatterns:['*.txt']}]}).success,false)
})

test('opening presentations honors fixed containers without moving the conversation or splitting its layout',()=>{
  let state=reduce(initialWorkbench(),{type:'open',document:{id:'chat',kind:'chat',title:'Chat',sessionId:'s'}})
  const layout=state.layout
  for(const [slot,group] of [['page','main'],['sidebar_panel','auxiliary'],['bottom_panel','panel'],['full_page','application'],['floating_window','floating']]) {
    const id='plugin:'+slot
    state=reduce(state,{type:'open',document:{id,kind:'plugin',title:slot,viewKey:slot,slot,sessionId:'s'}})
    assert.equal(state.tabs.find(tab=>tab.id===id).group,group)
    assert.equal(state.tabs.find(tab=>tab.id==='chat').group,'main')
    assert.deepEqual(state.layout,layout)
    if(slot!=='page') {
      assert.equal(reduce(state,{type:'move',id,group:'main'}),state)
      assert.equal(reduce(state,{type:'split',group:'main',axis:'horizontal',id}),state)
    }
  }
  assert.deepEqual(restoreWorkbench(JSON.stringify(state)),state)
  const dismissed=reduce(state,{type:'dismissApplication'})
  assert.equal(dismissed.active.application,null)
  assert.ok(dismissed.tabs.find(tab=>tab.slot==='full_page'))
  assert.deepEqual(restoreWorkbench(JSON.stringify(dismissed)),dismissed)
})
