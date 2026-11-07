import assert from 'node:assert/strict'
import test from 'node:test'
import { extensionShortcutOwner, publishExtensionShortcuts, observeExtensionShortcuts, runExtensionShortcut } from '../src/lib/extensions/extension-keybindings.ts'

test('all declared bindings work, while frame forwarding stays within component and session', () => {
  const before = globalThis.document
  let dialog = false, calls = 0
  globalThis.document = { querySelector: () => dialog ? {} : null }
  const owner = extensionShortcutOwner('widget','main','session-a'), events = []
  try {
    publishExtensionShortcuts(['Ctrl+E','Ctrl+G'].map(key=>({owner,key,run:()=>{calls++}})))
    const stop = observeExtensionShortcuts(owner, keys=>events.push(keys))
    const event = {key:'g',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,editing:true}
    assert.equal(runExtensionShortcut(event,owner),true)
    assert.equal(calls,1)
    assert.equal(runExtensionShortcut(event,extensionShortcutOwner('other','main','session-a')),false)
    assert.equal(runExtensionShortcut(event,extensionShortcutOwner('widget','main','session-b')),false)
    dialog=true; assert.equal(runExtensionShortcut(event,owner),false)
    assert.deepEqual(events,[['Ctrl+E','Ctrl+G']]); stop()
  } finally {publishExtensionShortcuts([]);globalThis.document=before}
})
