import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const clientSource = await readFile(new URL("../src/lib/agent-client.ts", import.meta.url), "utf8")
const realtimeSource = await readFile(new URL("../src/lib/realtime-stt.ts", import.meta.url), "utf8")
const transportSource = await readFile(new URL("../src/lib/rpc-transport.ts", import.meta.url), "utf8")
const chatSource = await readFile(new URL("../src/pages/chat/ChatPage.tsx", import.meta.url), "utf8")
const runtimeSource = await readFile(new URL("../src/hooks/useSessionRuntime.ts", import.meta.url), "utf8")
const speechSource = await readFile(new URL("../src/hooks/useTTSSpeech.ts", import.meta.url), "utf8")
const petSpeechSource = await readFile(new URL("../src/components/desktop-pet/bubble/hooks/usePetSpeechPlayback.ts", import.meta.url), "utf8")

test("voice calls stay behind the Rust Agent Server boundary", () => {
  assert.doesNotMatch(clientSource, /\/api\/tts/)
  assert.doesNotMatch(realtimeSource, /\/ws\/stt\/realtime/)
  assert.doesNotMatch(realtimeSource, /getStoredToken|resolveCoreBaseUrl/)
  assert.match(clientSource, /voice\.tts\.synthesize/)
  assert.match(clientSource, /voice\.tts\.list_segments/)
  assert.match(transportSource, /\/voice\/stt\/realtime/)
  assert.match(transportSource, /EDEN_AGENT_TOKEN_PROTOCOL_PREFIX/)
  assert.match(transportSource, /\/blobs\/\$\{encodeURIComponent\(blobId\)\}/)
  assert.doesNotMatch(speechSource, /resolveCoreAssetUrl/)
  assert.match(speechSource, /resolveVoiceBlobUrl/)
  assert.match(petSpeechSource, /useTTSSpeech/)
  assert.doesNotMatch(petSpeechSource, /synthesizeSpeechSegment|consumeSpeechStream/)
})

test("single-participant voice metadata has durable and historical fallbacks", () => {
  assert.match(chatSource, /speaker\?\.ttsConfigID \?\? soloTTSConfigId/)
  assert.match(chatSource, /participants\?\.\[0\]\?\.sttConfigID/)
  assert.match(runtimeSource, /onOpen:[\s\S]*getRuntimeModelConfig\(sessionID\)/)
})
