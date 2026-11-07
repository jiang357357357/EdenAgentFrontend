const test=require('node:test'),assert=require('node:assert/strict')
const {extensionWindowDecision,attachExtensionChild}=require('../src/windows/extension-window-policy.cjs')
const name='eden-plugin-12345678-1234-1234-1234-123456789012'
test('only named host shell windows are allowed and never inherit the desktop preload',()=>{
  const options={isPackaged:true,devOrigin:'http://127.0.0.1:40091'}
  const good=extensionWindowDecision({url:'edenagent://app/extension-window.html',frameName:name},options)
  assert.equal(good.action,'allow');assert.equal(good.outlivesOpener,false)
  assert.equal(good.overrideBrowserWindowOptions.webPreferences.nodeIntegration,false)
  assert.equal(good.overrideBrowserWindowOptions.webPreferences.contextIsolation,true)
  assert.match(good.overrideBrowserWindowOptions.webPreferences.preload,/extension-window-preload\.cjs$/)
  for(const url of ['https://example.com/extension-window.html','edenagent://app/index.html','edenagent://app/extension-window.html?token=x'])assert.equal(extensionWindowDecision({url,frameName:name},options),null)
  assert.equal(extensionWindowDecision({url:'edenagent://app/extension-window.html',frameName:'untrusted'},options),null)
})
test('floating window navigation stays in its shell and dirty-close veto is bypassed only during application quit',()=>{
  const events=new Map(),window={webContents:{setWindowOpenHandler:fn=>events.set('open',fn),on:(event,fn)=>events.set(event,fn)}}
  let quitting=false
  attachExtensionChild(window,{url:'http://127.0.0.1:40091/extension-window.html',frameName:name},{isPackaged:false,devOrigin:'http://127.0.0.1:40091'},()=>quitting)
  assert.equal(events.get('open')().action,'deny')
  let prevented=0;const event={preventDefault:()=>prevented++}
  events.get('will-navigate')(event,'https://example.com');assert.equal(prevented,1)
  events.get('will-prevent-unload')(event);assert.equal(prevented,1)
  quitting=true;events.get('will-prevent-unload')(event);assert.equal(prevented,2)
})
