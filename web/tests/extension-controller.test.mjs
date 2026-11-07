import assert from 'node:assert/strict'
import test from 'node:test'
import { ExtensionController } from '../src/lib/extensions/extension-controller.ts'

test('cancelling an activation wait settles immediately without cancelling another caller', async () => {
  let release
  const activation = new Promise(resolve => {release=resolve})
  const controller = new ExtensionController({},'',()=>{})
  controller.activate = () => activation
  const first = new AbortController(), second = new AbortController()
  let anotherFinished = false
  const another = controller.waitForActivation(second.signal).then(()=>{anotherFinished=true})
  const operation = controller.invoke('command','test',[],{signal:first.signal,handle:async()=>null})
  const rejected = assert.rejects(operation,{name:'AbortError'})
  first.abort(); await rejected
  assert.equal(anotherFinished,false)
  release(); await another; assert.equal(anotherFinished,true); controller.dispose()
})
