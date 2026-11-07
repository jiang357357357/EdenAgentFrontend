import assert from 'node:assert/strict'
import test from 'node:test'
import {preparePluginWindow,claimPluginWindow,releasePluginWindow} from '../src/components/workbench/plugin-windows.ts'

test('repeated opens reuse the owned window, development replay can reclaim it, and window count stays bounded',async()=>{
  const previous={window:globalThis.window,document:globalThis.document},opened=[],handles=[]
  globalThis.document={baseURI:'http://fixture/index.html'}
  globalThis.window={open:(url,name)=>{const handle={url,name,closed:false,focus(){},close(){this.closed=true}};opened.push(handle);return handle}}
  try{
    for(let index=0;index<8;index++){const id='window-'+index,handle=preparePluginWindow(id);handles.push([id,handle]);assert.ok(handle);assert.equal(claimPluginWindow(id),handle)}
    assert.equal(preparePluginWindow('ninth'),null)
    const [id,handle]=handles[0];assert.equal(preparePluginWindow(id),handle);assert.equal(opened.length,8)
    releasePluginWindow(id,handle);assert.equal(claimPluginWindow(id),handle)
    await new Promise(resolve=>setTimeout(resolve,150));assert.equal(handle.closed,false)
    assert.match(handle.name,/^eden-plugin-/);assert.equal(new URL(handle.url).pathname,'/extension-window.html')
  }finally{
    for(const[id,handle]of handles)releasePluginWindow(id,handle)
    await new Promise(resolve=>setTimeout(resolve,150))
    globalThis.window=previous.window;globalThis.document=previous.document
  }
})
