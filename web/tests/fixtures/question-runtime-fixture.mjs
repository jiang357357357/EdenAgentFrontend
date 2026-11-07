import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

// Execute the real hook with a small effect/state scheduler. RPCs and capture
// devices are controlled boundaries; reducers and feedback remain production code.
// This is not a React DOM/browser interaction test.
const key = '__edenQuestionRecoveryTest'
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
      // History maintenance is covered by its own renderer acceptance; this fixture controls recovery only.
      if (source === './useSessionHistoryMaintenance') return '\0recovery:history'
      const names = { 'virtual:recovery-hooks': 'hooks', '../lib/agent-client': 'rpc', '../lib/runtime-origin': 'origin',
        '../lib/rpc-transport': 'transport', '../lib/screen-capture': 'screen', '../lib/camera-capture': 'camera' }
      if (names[source]) return `\0recovery:${names[source]}`
    },
    load(id) {
      if (id === '\0recovery:history') return 'export const useSessionHistoryMaintenance=()=>{};'
      const call = (name, group) => `export const ${name}=(...args)=>globalThis.${key}.${group}.${name}(...args);`
      if (id === '\0recovery:hooks') return hooks.map(name => call(name, 'host')).join('\n')
      if (id === '\0recovery:transport') return `export const subscribeSessionChannelStatus=fn=>{globalThis.${key}.channelListeners.push(fn);return ()=>{} }; export const retainSessionChannels=()=>{}; export const forgetSessionChannel=()=>{}; export const pinSessionChannel=()=>()=>{};`
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

export { fixture, deferred };
