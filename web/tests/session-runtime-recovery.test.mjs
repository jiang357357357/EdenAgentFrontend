import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

// Execute the real hook with a small effect/state scheduler. RPCs and capture
// devices are controlled boundaries; reducers and feedback remain production code.
// This is not a React DOM/browser interaction test.
const key = '__edenRuntimeRecoveryTest'
const rpcNames = ['abortSession', 'compactSession', 'createSessionRaw', 'deleteSession', 'getPermissionMode',
  'getRuntimeModelConfig', 'followUpTurn', 'getSubagentThreadDetails', 'followupSubagent', 'interruptSubagent',
  'listPermissionsRaw', 'listCameraCaptureRequests', 'listQuestionsRaw', 'listScreenCaptureRequests',
  'listMessagesRaw', 'readSessionRaw', 'listSessionsRaw', 'isBackgroundSession', 'rejectQuestion', 'renameSession',
  'replyPermission', 'replyQuestion', 'sendPromptAsync', 'setPermissionMode', 'updateSessionParticipants', 'subscribeEvents']
const hooks = ['useCallback', 'useEffect', 'useMemo', 'useReducer', 'useRef', 'useState']
const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', plugins: [{
    name: 'runtime-recovery-controlled-boundaries', enforce: 'pre',
    transform(source, id) {
      if (/\/hooks\/useSession(?:Runtime|ConnectionFeedback)\.ts$/.test(id.replaceAll('\\', '/'))) return source.replace("from 'react'", "from 'virtual:recovery-hooks'")
    },
    resolveId(source, importer) {
      if (!/\/hooks\/useSession(?:Runtime|ConnectionFeedback)\.ts$/.test(importer?.replaceAll('\\', '/') ?? '')) return
      const names = { 'virtual:recovery-hooks': 'hooks', '../lib/agent-client': 'rpc', '../lib/runtime-origin': 'origin',
        '../lib/rpc-transport': 'transport', '../lib/screen-capture': 'screen', '../lib/camera-capture': 'camera' }
      if (names[source]) return `\0recovery:${names[source]}`
    },
    load(id) {
      const call = (name, group) => `export const ${name}=(...args)=>globalThis.${key}.${group}.${name}(...args);`
      if (id === '\0recovery:hooks') return hooks.map(name => call(name, 'host')).join('\n')
      if (id === '\0recovery:transport') return `export const subscribeSessionChannelStatus=fn=>{globalThis.${key}.channelListeners.push(fn);return ()=>{} }; export const retainSessionChannels=()=>{}; export const forgetSessionChannel=()=>{};`
      if (id === '\0recovery:rpc') return rpcNames.map(name => call(name, 'rpc')).join('\n')
      if (id === '\0recovery:origin') return `export const getRuntimeOriginRevision=()=>globalThis.${key}.origin; export const getStoredRuntimeOrigin=()=>globalThis.${key}.realm;`
      if (id === '\0recovery:screen') return call('handleScreenCaptureRequest', 'rpc')
      if (id === '\0recovery:camera') return call('handleCameraCaptureRequest', 'rpc')
    },
  }] })
after(async () => { delete globalThis[key]; await vite.close() })
const { useSessionRuntime } = await vite.ssrLoadModule('/src/hooks/useSessionRuntime.ts')
const changed = (previous, next) => !previous || !next || previous.length !== next.length || next.some((value, i) => !Object.is(value, previous[i]))

class HookHost {
  slots = []; effects = []; cursor = 0; dirty = true; enabled = true; mounted = true; options = {}
  useState(initial) {
    const index = this.cursor++
    const slot = this.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
    slot.set ??= update => { const next = typeof update === 'function' ? update(slot.value) : update
      if (!Object.is(slot.value, next)) { slot.value = next; if (this.mounted) this.dirty = true } }
    return [slot.value, slot.set]
  }
  useReducer(reducer, initial) { const [state, set] = this.useState(initial); return [state, action => set(previous => reducer(previous, action))] }
  useRef(initial) { return (this.slots[this.cursor++] ??= { current: initial }) }
  useMemo(make, deps) { const index = this.cursor++; const slot = this.slots[index]
    if (!slot || changed(slot.deps, deps)) this.slots[index] = { deps, value: make() }
    return this.slots[index].value }
  useCallback(callback, deps) { return this.useMemo(() => callback, deps) }
  useEffect(effect, deps) { const index = this.cursor++; const slot = this.slots[index]
    if (!slot || changed(slot.deps, deps)) {
      this.slots[index] = { deps, cleanup: slot?.cleanup }
      this.effects.push(() => { slot?.cleanup?.(); this.slots[index].cleanup = effect() })
    } }
  render() { this.dirty = false; this.cursor = 0; this.value = useSessionRuntime(this.enabled, this.options)
    for (const effect of this.effects.splice(0)) effect() }
  async settle() { for (let i = 0; i < 25; i++) { if (this.dirty) this.render(); await new Promise(resolve => setImmediate(resolve)) } }
  dispose() { this.mounted = false; for (const slot of this.slots) slot?.cleanup?.() }
}

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const session = id => ({ id, title: id, time: { created: 1, updated: 1 } })
const page = (id, text = id) => ({ items: [{ info: { id: `${id}-message`, sessionID: id, role: 'user', time: { created: 1 } },
  parts: [{ id: `${id}-text`, type: 'text', text }] }], hasMore: false })
function fixture() {
  const host = new HookHost()
  const f = { host, origin: 0, realm: 'mon', subscriptions: [], channelListeners: [], modelCalls: [], captures: [], rpc: {} }
  Object.assign(f.rpc, {
    readSessionRaw: async id => session(id), listSessionsRaw: async () => [session('A'), session('B')], listMessagesRaw: async id => page(id),
    listPermissionsRaw: async () => [], listQuestionsRaw: async () => [], getPermissionMode: async () => ({ mode: 'restricted' }),
    listScreenCaptureRequests: async () => [], listCameraCaptureRequests: async () => [], isBackgroundSession: async () => false,
    getRuntimeModelConfig: async id => { f.modelCalls.push(id); return {} },
    subscribeEvents: async callbacks => { f.subscriptions.push(callbacks); return () => {} },
    handleScreenCaptureRequest: request => f.captures.push(request), handleCameraCaptureRequest: request => f.captures.push(request),
  })
  globalThis[key] = f
  f.open = async () => { f.subscriptions.at(-1).onOpen(); await host.settle() }
  f.reconnect = async () => { f.subscriptions.at(-1).onError('fixture disconnect'); await f.open() }
  return f
}

test('late reset/disabled/world snapshots and old callbacks cannot repopulate the runtime or start capture', async () => {
  const f = fixture(); const { host } = f
  try {
    await host.settle(); await f.open()
    const background = deferred(), blockers = deferred()
    f.rpc.listSessionsRaw = async () => [session('A')]
    f.rpc.isBackgroundSession = () => background.promise
    f.rpc.listScreenCaptureRequests = () => blockers.promise
    await f.reconnect()
    const oldSubscription = f.subscriptions.at(-1)
    const subscriptionsBeforeReset = f.subscriptions.length
    host.value.reset()
    oldSubscription.onOpen(); oldSubscription.onError('late old account error')
    f.rpc.listSessionsRaw = async () => [session('NEW')]
    f.rpc.isBackgroundSession = async () => false
    f.rpc.listScreenCaptureRequests = async () => []
    await host.settle(); await f.open()
    assert.equal(f.subscriptions.length, subscriptionsBeforeReset + 1, 'reset must resubscribe even when enabled stays true')
    background.resolve(true); blockers.resolve([{ id: 'capture', sessionID: 'STALE' }])
    await host.settle()
    assert.deepEqual(host.value.sessions.map(value => value.id), ['NEW'])
    assert.equal(f.captures.length, 0)

    const disabledList = deferred()
    f.rpc.listSessionsRaw = () => disabledList.promise
    await f.reconnect()
    host.enabled = false; host.dirty = true
    await host.settle()
    disabledList.reject(new Error('late disabled failure'))
    await host.settle()
    assert.equal(host.value.sessions.length, 0)
    assert.equal(host.value.connectionFeedback.phase, 'idle')
    assert.equal(host.value.connectionError, undefined)

    f.rpc.listSessionsRaw = async () => [session('NEW')]
    f.rpc.listScreenCaptureRequests = async () => []
    host.enabled = true; host.dirty = true; await host.settle(); await f.open()
    const oldPage = deferred()
    f.rpc.listMessagesRaw = () => oldPage.promise
    await f.reconnect()
    f.origin += 1 // invalidates before a React render or the App reset callback
    oldPage.resolve(page('NEW', 'OLD_WORLD_RESULT'))
    await host.settle()
    assert.ok(!JSON.stringify(host.value.sessions).includes('OLD_WORLD_RESULT'))
    assert.notEqual(host.value.connectionFeedback.phase, 'restored')
  } finally { host.dispose() }
})

test('recovery refreshes models, surfaces auth failure, and keeps business errors separate from synchronization', async () => {
  const f = fixture(); const { host } = f
  try {
    await host.settle(); await f.open()
    const before = f.modelCalls.length
    f.rpc.getRuntimeModelConfig = async id => { f.modelCalls.push(id); throw new Error('Mon authentication rejected: 401') }
    await f.reconnect()
    assert.ok(f.modelCalls.length > before, 'reconnect must request the active model configuration')
    assert.equal(host.value.connectionFeedback.phase, 'sync-error')
    assert.match(host.value.runtimeError, /authentication rejected/)
    f.rpc.getRuntimeModelConfig = async () => ({})
    host.value.retryConnectionSync(); await host.settle()
    assert.equal(host.value.connectionFeedback.phase, 'restored')
    assert.equal(host.value.runtimeError, undefined)
    f.rpc.getRuntimeModelConfig = async () => { throw new Error('Select a model for this session') }
    host.value.retryConnectionSync(); await host.settle()
    assert.equal(host.value.connectionFeedback.phase, 'restored', JSON.stringify(host.value.connectionFeedback))
    assert.equal(host.value.runtimeError, 'Select a model for this session')
    host.value.selectSession('B'); await host.settle()
    assert.equal(host.value.activeSessionId, 'B')
  } finally { host.dispose() }
})

test('new recovery revisions ignore stale failures and selection changes wait for the newly selected snapshot', async () => {
  const f = fixture(); const { host } = f
  try {
    await host.settle(); await f.open()
    const stale = deferred(); f.rpc.listSessionsRaw = () => stale.promise
    await f.reconnect()
    f.rpc.listSessionsRaw = async () => [session('A'), session('B')]
    const snapshots = { A: deferred(), B: deferred() }; const calls = []
    f.rpc.listMessagesRaw = id => { calls.push(id); return snapshots[id].promise }
    host.value.retryConnectionSync(); await host.settle()
    stale.reject(new Error('obsolete snapshot failure')); await host.settle()
    host.value.selectSession('B'); await host.settle()
    snapshots.A.resolve(page('A', 'NEW_A')); await host.settle()
    assert.ok(calls.includes('B'))
    assert.equal(host.value.connectionFeedback.phase, 'restoring', JSON.stringify(host.value.connectionFeedback))
    assert.equal(host.value.runtimeError, undefined)
    snapshots.B.resolve(page('B', 'NEW_B')); await host.settle()
    assert.equal(host.value.connectionFeedback.phase, 'restored')
    assert.equal(host.value.activeSessionId, 'B')
    assert.ok(JSON.stringify(host.value.activeSession).includes('NEW_B'))
    assert.ok(JSON.stringify(host.value.sessions).includes('NEW_A'))
  } finally { host.dispose() }
})

test('initial open failure remains visible without claiming a successful recovery', async () => {
  const f = fixture(); const { host } = f
  try {
    await host.settle()
    f.rpc.listSessionsRaw = async () => { throw new Error('initial snapshot failed') }
    await f.open()
    assert.equal(host.value.connectionFeedback.phase, 'idle')
    assert.equal(host.value.runtimeError, 'initial snapshot failed')
  } finally { host.dispose() }
})

test('a background channel recovery cannot replace another tab feedback or messages', async () => {
  const f = fixture(); const { host } = f
  try {
    await host.settle(); await f.open()
    const channel = status => f.channelListeners.at(-1)(status)
    channel({ sessionId: 'A', connected: true }); channel({ sessionId: 'B', connected: true })
    await host.settle()
    host.value.selectSession('B'); await host.settle()
    const recovered = deferred()
    f.rpc.listMessagesRaw = id => id === 'A' ? recovered.promise : Promise.resolve(page('B', 'B_LIVE'))
    channel({ sessionId: 'A', connected: false, error: 'A_ONLY_FAILURE' }); await host.settle()
    assert.equal(host.value.activeSessionId, 'B')
    assert.notEqual(host.value.connectionFeedback.phase, 'reconnecting')
    assert.equal(host.value.connectionState, 'connected')
    channel({ sessionId: 'A', connected: true }); await host.settle()
    assert.notEqual(host.value.connectionFeedback.phase, 'restoring')
    recovered.resolve(page('A', 'A_RECOVERED')); await host.settle()
    assert.equal(host.value.activeSessionId, 'B')
    assert.ok(JSON.stringify(host.value.sessions).includes('A_RECOVERED'))
    host.value.selectSession('A'); await host.settle()
    assert.equal(host.value.connectionFeedback.phase, 'restored')
    assert.ok(JSON.stringify(host.value.activeSession).includes('A_RECOVERED'))
  } finally { host.dispose() }
})

test('a failing session snapshot reports its own sync error and retry leaves a sibling usable', async () => {
  const f = fixture(); const { host } = f
  try {
    await host.settle(); await f.open()
    f.rpc.listMessagesRaw = async id => { if (id === 'A') throw new Error('A_SNAPSHOT_FAILED'); return page(id) }
    f.channelListeners.at(-1)({ sessionId: 'A', connected: true }); await host.settle()
    assert.equal(host.value.connectionFeedback.phase, 'sync-error')
    assert.match(host.value.connectionFeedback.reason, /A_SNAPSHOT_FAILED/)
    host.value.selectSession('B'); await host.settle()
    f.channelListeners.at(-1)({ sessionId: 'B', connected: true }); await host.settle()
    assert.notEqual(host.value.connectionFeedback.phase, 'sync-error')
    host.value.selectSession('A'); await host.settle()
    f.rpc.listMessagesRaw = async id => page(id, 'RECOVERED')
    host.value.retryConnectionSync(); await host.settle()
    assert.equal(host.value.connectionFeedback.phase, 'restored')
  } finally { host.dispose() }
})

test('first send on an empty chosen-folder session binds its assistant and waits for its model without following tab selection', async () => {
  const f = fixture(), { host } = f, binding = deferred(), calls = []
  host.options = { defaultParticipantID: 42 }
  try {
    await host.settle(); await f.open()
    f.rpc.readSessionRaw = async id => ({ ...session(id), participants: [], directory: 'E:/chosen-A' })
    f.rpc.updateSessionParticipants = (id, ids) => { calls.push(['participants-and-model', id, ids]); return binding.promise }
    f.rpc.sendPromptAsync = async (id, content) => { calls.push(['send', id, content]); return { turnId: 'turn-A' } }
    const sending = host.value.sendMessage('first message', [])
    await host.settle()
    assert.deepEqual(calls, [['participants-and-model', 'A', [42]]])
    host.value.selectSession('B'); await host.settle()
    binding.resolve({ ...session('A'), participants: [{ assistantID: 42 }], directory: 'E:/chosen-A' })
    await sending; await host.settle()
    assert.deepEqual(calls, [['participants-and-model', 'A', [42]], ['send', 'A', 'first message']])
    assert.equal(host.value.activeSessionId, 'B')
    assert.deepEqual(host.value.sessions.find(item => item.id === 'A').participants, [{ assistantID: 42 }])
    // No new session or workspace switch is issued: the existing server-side
    // directory binding remains on A while only its participants are updated.
  } finally { host.dispose() }
})

test('an empty Mon session without a selected assistant rejects send instead of borrowing a sibling participant', async () => {
  const f = fixture(), { host } = f, calls = []
  f.rpc.listSessionsRaw = async () => [{ ...session('A'), participants: [] }, { ...session('B'), participants: [{ assistantID: 99 }] }]
  f.rpc.updateSessionParticipants = async (...args) => { calls.push(args) }
  f.rpc.sendPromptAsync = async (...args) => { calls.push(args) }
  try {
    await host.settle(); await f.open()
    await assert.rejects(host.value.sendMessage('no implicit assistant', []), /请先为此会话选择助手/)
    await host.settle()
    assert.deepEqual(calls, [])
    assert.match(host.value.runtimeError, /请先为此会话选择助手/)
  } finally { host.dispose() }
})

test('existing Mon participants and a valid empty Local session are never overwritten with default Mon participants', async () => {
  for (const realm of ['mon', 'local']) {
    const f = fixture(), { host } = f, calls = []
    f.realm = realm; host.options = { defaultParticipantID: 42 }
    f.rpc.readSessionRaw = async id => ({ ...session(id), participants: realm === 'mon' ? [{ assistantID: 77 }] : [] })
    f.rpc.updateSessionParticipants = async (...args) => { calls.push(['replace', ...args]) }
    f.rpc.sendPromptAsync = async (id, content) => { calls.push(['send', id, content]); return { turnId: 'turn-A' } }
    try {
      await host.settle(); await f.open()
      await host.value.sendMessage('keep existing configuration', [])
      assert.deepEqual(calls, [['send', 'A', 'keep existing configuration']], realm)
    } finally { host.dispose() }
  }
})

test('identity changes while reading an empty session or binding its model prevent any later send or stale hydration', async () => {
  for (const stage of ['read', 'binding']) {
    const f = fixture(), { host } = f, pending = deferred(), calls = []
    host.options = { defaultParticipantID: 42 }
    try {
      await host.settle(); await f.open()
      f.rpc.readSessionRaw = id => stage === 'read' ? pending.promise : Promise.resolve({ ...session(id), participants: [] })
      f.rpc.updateSessionParticipants = (id, ids) => { calls.push(['bind', id, ids]); return pending.promise }
      f.rpc.sendPromptAsync = async (...args) => { calls.push(['send', ...args]); return { turnId: 'unexpected' } }
      const rejected = assert.rejects(host.value.sendMessage('old identity', []), /账号或世界已切换/)
      await host.settle()
      f.origin++; f.realm = 'local' // account/world revision invalidates immediately, before a React render
      pending.resolve({ ...session('A'), participants: [{ assistantID: 42 }], title: 'STALE_MODEL_RESULT' })
      await rejected; await host.settle()
      assert.deepEqual(calls, stage === 'read' ? [] : [['bind', 'A', [42]]])
      assert.ok(!JSON.stringify(host.value.sessions).includes('STALE_MODEL_RESULT'))
    } finally { host.dispose() }
  }
})

test('a pending first-send model binding rejects only a duplicate send to that session while a sibling can send', async () => {
  const f = fixture(), { host } = f, binding = deferred(), calls = []
  host.options = { defaultParticipantID: 42 }
  try {
    await host.settle(); await f.open()
    f.rpc.readSessionRaw = async id => ({ ...session(id), participants: id === 'A' ? [] : [{ assistantID: 77 }] })
    f.rpc.updateSessionParticipants = (id, ids) => { calls.push(['bind', id, ids]); return binding.promise }
    f.rpc.sendPromptAsync = async (id, content) => { calls.push(['send', id, content]); return { turnId: `turn-${id}` } }
    const first = host.value.sendMessage('first A', [])
    await host.settle()
    await assert.rejects(host.value.sendMessage('duplicate A', []), /此会话正在准备/)
    host.value.selectSession('B'); await host.settle()
    await host.value.sendMessage('independent B', [])
    assert.deepEqual(calls, [['bind', 'A', [42]], ['send', 'B', 'independent B']])
    binding.resolve({ ...session('A'), participants: [{ assistantID: 42 }] }); await first
    assert.deepEqual(calls.at(-1), ['send', 'A', 'first A'])
  } finally { host.dispose() }
})
