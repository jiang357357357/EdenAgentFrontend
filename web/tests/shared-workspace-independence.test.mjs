import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const previousWindow = globalThis.window
const events = new EventTarget()
globalThis.window = {
  localStorage: { getItem: key => key === 'agent.runtime_origin' ? 'mon' : null },
  addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
  dispatchEvent: events.dispatchEvent.bind(events), setInterval: () => 1, clearInterval: () => {},
}
let effects = []
globalThis.__sharedReact = {
  useState: () => [0, () => {}], useRef: current => ({ current }),
  useMemo: make => make(), useEffect: effect => { effects.push(effect) },
}
globalThis.__sharedRpc = async (_origin, method) => method === 'sharedWorkspace.status'
  ? { root: 'E:/shared', available: true, bound: false, spaceId: null, lastSync: null }
  : { spaces: [] }
const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  ssr: { noExternal: ['react'] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
  plugins: [{ name: 'independent-shared-hook-fixture', enforce: 'pre',
    resolveId(source) {
      if (source === 'react') return '\0shared-react'
      if (/(?:^|\/)rpc-transport(?:\.ts)?$/.test(source)) return '\0shared-rpc'
    },
    load(id) {
      if (id === '\0shared-react') return 'export const {useState,useRef,useMemo,useEffect} = globalThis.__sharedReact'
      if (id === '\0shared-rpc') return 'export const rpcRequestForOrigin = (...args) => globalThis.__sharedRpc(...args); export const rpcRequest = () => {}'
    },
  }],
})
after(async () => { await vite.close(); globalThis.window = previousWindow; delete globalThis.__sharedReact; delete globalThis.__sharedRpc })
const { useSharedWorkspace } = await vite.ssrLoadModule('/src/components/shared-workspace/use-shared-workspace.ts')

function mounted() {
  effects = []
  const invalidated = []
  const owner = useSharedWorkspace({ sessionId: 'session-a', directoryPath: 'E:/shared' }, { onInvalidated: reason => invalidated.push(reason) })
  const cleanups = effects.map(effect => effect()).filter(Boolean)
  return { owner, invalidated, close: () => cleanups.forEach(cleanup => cleanup()) }
}

test('a current workspace change does not close or invalidate the mounted shared-library view', () => {
  const f = mounted()
  try {
    events.dispatchEvent(new CustomEvent('edenagent:workspace-changed', { detail: { sessionId: 'session-a', path: 'E:/different-project' } }))
    assert.equal(f.owner.isCurrent(), true); assert.deepEqual(f.invalidated, [])
  } finally { f.close() }
})

test('an account-wide shared-directory change from another session invalidates the old shared view', () => {
  const f = mounted()
  try {
    events.dispatchEvent(new CustomEvent('edenagent:shared-directory-changed', { detail: { sessionId: 'session-b', path: 'E:/shared' } }))
    assert.equal(f.owner.isCurrent(), true)
    events.dispatchEvent(new CustomEvent('edenagent:shared-directory-changed', { detail: { sessionId: 'session-b', path: 'E:/other-library' } }))
    assert.equal(f.owner.isCurrent(), false); assert.deepEqual(f.invalidated, ['directory'])
  } finally { f.close() }
})
