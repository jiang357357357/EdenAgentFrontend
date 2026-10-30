import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

test('participant creation bypasses old assistant cache and metadata updates reach the session view', async () => {
  const previousWindow = globalThis.window
  let configured = false, calls = 0
  const events = new EventTarget()
  globalThis.window = {
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    localStorage: { getItem: key => key === 'agent.runtime_origin' ? 'mon' : key === 'agent.auth_token' ? 'fixture-token' : null },
    edenAgentDesktop: { invoke: async command => {
      assert.equal(command, 'core_get_assistant'); calls++
      return { id: 4, name: 'Fixture', character: { id: 4, name: 'Fixture', tts_config_id: configured ? 2 : null, stt_config_id: configured ? 1 : null } }
    } },
  }
  const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const auth = await vite.ssrLoadModule('/src/lib/auth.ts')
    const participants = await vite.ssrLoadModule('/src/lib/session-participants.ts')
    const transport = await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
    await auth.fetchAssistant('fixture-token', 4)
    configured = true
    const fresh = await participants.resolveParticipants([4], participants.captureParticipantIdentity())
    assert.equal(calls, 2); assert.equal(fresh[0].ttsConfigId, 2); assert.equal(fresh[0].sttConfigId, 1)
    const projected = transport.projectSessionEvent({ sessionId: 'fixture', eventType: 'session.metadata.updated',
      payload: { participants: fresh }, createdAt: '100' })
    assert.equal(projected[0].type, 'session.participants_updated')
    assert.equal(projected[0].properties.participants[0].ttsConfigID, 2)
  } finally { await vite.close(); globalThis.window = previousWindow }
})
