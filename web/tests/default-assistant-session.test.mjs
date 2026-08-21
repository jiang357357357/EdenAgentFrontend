import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [appSource, runtimeSource, clientSource] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/hooks/useSessionRuntime.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/agent-client.ts", import.meta.url), "utf8"),
])

test("new conversations bind the authenticated Core current assistant", () => {
  assert.match(appSource, /defaultParticipantID:\s*currentAssistant\?\.id/)
  assert.match(runtimeSource, /defaultParticipantID\?: number \| string/)
  assert.match(runtimeSource, /setDraftParticipantIDs\(\(current\) => current\.length \? current : \[defaultParticipantID\]\)/)
  assert.match(runtimeSource, /createSessionRaw\(draftParticipantIDs/)
})

test("participant profiles are resolved before the durable session is created", () => {
  assert.match(clientSource, /const participants = await resolveParticipants\(assistantIDs\)/)
  assert.match(clientSource, /rpcRequest\("session\.create", \{ title: "", participants, environment \}\)/)
  assert.match(clientSource, /profile: assistant == null \? undefined/)
})
