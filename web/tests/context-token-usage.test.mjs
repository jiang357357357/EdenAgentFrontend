import assert from "node:assert/strict"
import { after, test } from "node:test"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
const transport = await vite.ssrLoadModule("/src/lib/rpc-transport.ts")
const reducer = await vite.ssrLoadModule("/src/lib/session-reducer.ts")

after(async () => {
  await vite.close()
})

const breakdown = {
  character: 779n,
  skills: 423n,
  system: 576n,
  tools: 9759n,
  history: 1717n,
  cacheRead: 1024n,
  cacheMiss: 18028n,
  cacheHitRate: 1024 / 19052,
  providerInput: 19052n,
  providerOutput: 198n,
  providerAdjustment: 5996n,
  contextMeasurement: "provider",
  promptCacheFingerprint: "fingerprint",
  promptCacheEpoch: 1n,
  promptCacheInvalidationReason: "system",
  tokenizer: "o200k_base",
  tokenizerModel: "mimo-v2.5",
}

test("session summaries hydrate every authoritative token category", () => {
  const session = transport.apiSession({
    id: "session-1",
    title: "usage",
    titleSource: "user",
    status: "active",
    participants: [],
    environment: null,
    contextTokens: 13254n,
    tokenBreakdown: breakdown,
    createdAt: 1n,
    updatedAt: 2n,
  })

  assert.equal(session.contextTokens, 13254)
  assert.deepEqual(session.tokenBreakdown, {
    character: 779,
    skills: 423,
    system: 576,
    tools: 9759,
    history: 1717,
    cacheRead: 1024,
    cacheMiss: 18028,
    cacheHitRate: 1024 / 19052,
    providerInput: 19052,
    providerOutput: 198,
    providerAdjustment: 5996,
    contextMeasurement: "provider",
    promptCacheFingerprint: "fingerprint",
    promptCacheEpoch: 1,
    promptCacheInvalidationReason: "system",
    tokenizer: "o200k_base",
    tokenizerModel: "mimo-v2.5",
  })
})

test("live context usage replaces browser estimates in the session reducer", () => {
  let state = reducer.runtimeReducer(reducer.initialRuntimeState, reducer.hydrateSessionList([{
    id: "session-1",
    title: "usage",
    time: { created: 1, updated: 1 },
  }]))
  const [event] = transport.projectSessionEvent({
    id: "usage-event",
    sessionId: "session-1",
    turnId: "turn-1",
    seq: 1n,
    eventType: "context.usage_updated",
    payload: {
      contextTokens: 40256,
      tokenBreakdown: {
        character: 779,
        skills: 423,
        system: 576,
        tools: 9759,
        history: 28719,
        cacheRead: 38912,
        cacheMiss: 1295,
        cacheHitRate: 38912 / 40207,
        providerInput: 40207,
        providerOutput: 49,
        providerAdjustment: 487,
        contextMeasurement: "provider",
        promptCacheEpoch: 1,
      },
    },
    createdAt: 2n,
  })
  state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(event))

  assert.equal(state.sessions["session-1"].contextTokens, 40256)
  assert.equal(state.sessions["session-1"].tokenBreakdown.tools, 9759)
  assert.equal(state.sessions["session-1"].tokenBreakdown.history, 28719)
  assert.equal(state.sessions["session-1"].tokenBreakdown.cacheRead, 38912)
  assert.equal(state.sessions["session-1"].tokenBreakdown.providerInput, 40207)
  assert.equal(state.sessions["session-1"].tokenBreakdown.providerOutput, 49)
  assert.equal(state.sessions["session-1"].tokenBreakdown.providerAdjustment, 487)
  assert.equal(state.sessions["session-1"].tokenBreakdown.contextMeasurement, "provider")
})

test("token meter keeps the server total authoritative and exposes provider calibration", async () => {
  const source = await readFile(
    new URL("../src/components/chat/input/ChatInputControls.tsx", import.meta.url),
    "utf8",
  )

  assert.match(source, /const authoritativeContextTokens = contextTokens/)
  assert.match(source, />供应商输入</)
  assert.match(source, />供应商输出</)
  assert.match(source, />供应商校准</)
  assert.match(source, />未命中缓存</)
})
