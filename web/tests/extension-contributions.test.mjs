import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesContribution, matchesKeybinding } from '../src/lib/extensions/contribution-context.ts'
import { extensionViewActions } from '../src/components/plugin-ui/extension-view-actions.ts'

test('command contexts and shortcuts match only their declared workbench conditions', () => {
  const context = { sessionAvailable: true, sessionRunning: false, activeView: 'widget/main/list' }
  assert.equal(matchesContribution({ sessionAvailable: true, activeView: 'widget/main/list' }, context), true)
  assert.equal(matchesContribution({ sessionRunning: true }, context), false)
  assert.equal(matchesContribution({ activeView: 'other/main/list' }, context), false)
  const key = { key: 'e', ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }
  assert.equal(matchesKeybinding('Ctrl+Alt+E', key), true)
  assert.equal(matchesKeybinding('Ctrl+E', key), false)
  assert.equal(matchesKeybinding('Ctrl+Alt+Shift+E', key), false)
  assert.equal(matchesKeybinding('CtrlCmd+E', { ...key, ctrlKey: false, metaKey: true, altKey: false }), true)
})

test('view messages bind their invocation session and instance while tree refresh reaches same-session views', () => {
  const events = [], statuses = [], opened = []
  const view = { instanceId: 'first-instance', view: { id: 'main' }, module: { pluginId: 'widget', componentId: 'ui', revision: 'a'.repeat(64),
    document: { apiVersion: 2, views: [{ id: 'main' }, { id: 'tree' }], contributes: { statusBar: [{ id: 'count' }] } } },
    extension: { notifyView: (...args) => events.push(args) } }
  const actions = extensionViewActions(view, { openView: id => opened.push(id), status: (...args) => statuses.push(args) }, 'session-a')
  actions.postMessage({ privateValue: 1 }); actions.refreshTree('tree')
  assert.deepEqual(events[0], ['message', 'main', { privateValue: 1 }, { sessionId: 'session-a', instanceId: 'first-instance' }])
  assert.deepEqual(events[1], ['refresh', 'tree', undefined, { sessionId: 'session-a' }])
  actions.openView('tree'); assert.deepEqual(opened, ['widget/ui/tree'])
  actions.status('count', '2'); assert.equal(statuses[0][0], `widget/ui/${'a'.repeat(64)}/count`)
  assert.throws(() => actions.openView('another-extension'), /未声明/)
  assert.throws(() => actions.status('undeclared', '2'), /未声明/)
})

test('ambient commands broadcast only to views of their own component and invocation session', () => {
  const events = [], view = { view: { id: '$extension' }, module: { pluginId: 'widget', componentId: 'ui', revision: 'a'.repeat(64),
    document: { apiVersion: 2, views: [{ id: 'main' }, { id: 'tree' }] } }, extension: { notifyView: (...args) => events.push(args) } }
  extensionViewActions(view, {}, 'session-b').postMessage('update')
  assert.deepEqual(events.map(item => [item[1], item[3]]), [['main', { sessionId: 'session-b' }], ['tree', { sessionId: 'session-b' }]])
})
