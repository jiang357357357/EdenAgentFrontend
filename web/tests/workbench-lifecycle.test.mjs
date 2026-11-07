import assert from 'node:assert/strict'
import test,{after} from 'node:test'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}})
const {DocumentLifecycle}=await vite.ssrLoadModule('/src/components/workbench/document-lifecycle.tsx')
const {runtimeReducer,initialRuntimeState,hydrateSessionList}=await vite.ssrLoadModule('/src/lib/session-reducer.ts')
const {SessionRpcChannels}=await vite.ssrLoadModule('/src/lib/session-rpc-channels.ts')
const values=new Map(),previous=globalThis.localStorage
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}
after(async()=>{await vite.close();if(previous)globalThis.localStorage=previous;else delete globalThis.localStorage})
test('failed saves retain dirty state and successful saves clear only the intended document',async()=>{
  const store=new DocumentLifecycle('a');let saved=0
  store.register('a',{save:async()=>{throw Error('expected failure')}})
  store.register('b',{save:async()=>{saved++}})
  store.dirty('a',true);store.dirty('b',true)
  await assert.rejects(store.save('a'),/expected failure/)
  assert.equal(store.entry('a').dirty,true)
  await store.save('b');assert.equal(saved,1);assert.equal(store.entry('b').dirty,false)
})
test('drafts are isolated by workspace-account and instance, and saved closed drafts remain discoverable',()=>{
  const first=new DocumentLifecycle('workspace-a:user-a'),second=new DocumentLifecycle('workspace-b:user-a')
  first.writeDraft('draft-1','first');first.writeDraft('draft-2','second')
  assert.equal(second.readDraft('draft-1'),'');assert.equal(first.readDraft('draft-2'),'second')
  first.remember({id:'draft-1',kind:'chat',sessionId:'',title:'新会话',group:'main'})
  assert.equal(first.archived()[0].id,'draft-1')
})
test('a fresh independent editor does not select an existing conversation while the list hydrates',()=>{
  const session={id:'existing',title:'existing',time:{created:1,updated:1},participants:[]}
  assert.equal(runtimeReducer(initialRuntimeState,hydrateSessionList([session],false)).activeSessionId,undefined)
  assert.equal(runtimeReducer(initialRuntimeState,hydrateSessionList([session])).activeSessionId,'existing')
})
test('an open idle editor survives the five-minute cache cleanup until its reference is released',async()=>{
  const pool=new SessionRpcChannels({connect:async()=>{},event(){},status(){}}),original=Date.now
  let clock=1000;Date.now=()=>clock
  try{
    await pool.ensure('first');await pool.ensure('second')
    clock+=6*60_000
    pool.retain('second',['first'])
    assert.equal(pool.snapshot().length,2)
    pool.retain('second',[])
    assert.deepEqual(pool.snapshot().map(item=>item.sessionId),['second'])
  }finally{Date.now=original;pool.dispose()}
})

test('a reloaded plugin view keeps declared draft state and dirty status while clearing stale save callbacks',()=>{
  const store=new DocumentLifecycle('plugin-views')
  store.writeViewState('first','revision/view',{draft:'kept'})
  const dispose=store.register('first',{save:async()=>{}});store.dirty('first',true);dispose()
  assert.equal(store.entry('first').dirty,true)
  assert.equal(store.entry('first').save,undefined)
  assert.deepEqual(store.readViewState('first','revision/view'),{draft:'kept'})
  assert.equal(store.readViewState('second','revision/view'),null)
  store.releaseDocument('first');assert.equal(store.anyDirty(),false)
  assert.equal(store.readViewState('first','revision/view'),null)
})
