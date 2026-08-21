import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("stream retries keep one message identity and retract provisional parts", () => {
  const client = readFileSync(new URL("../src/lib/agent-client.ts", import.meta.url), "utf8")
  const transport = readFileSync(new URL("../src/lib/rpc-transport.ts", import.meta.url), "utf8")
  const reducer = readFileSync(new URL("../src/lib/session-reducer.ts", import.meta.url), "utf8")
  const speech = readFileSync(new URL("../src/hooks/useTTSSpeech.ts", import.meta.url), "utf8")

  assert.match(client, /agent\.message_start" && role !== "toolResult" && !activeMessages\.has\(key\)/)
  assert.match(transport, /event\.eventType === "agent\.stream_reset"/)
  assert.match(transport, /type: "message\.stream_reset"/)
  assert.match(reducer, /isMessageStreamResetEvent\(event\)/)
  assert.match(reducer, /message\.parts = \{\}/)
  assert.match(reducer, /message\.partOrder = \[\]/)
  assert.match(reducer, /message\.speechEpoch = \(message\.speechEpoch \?\? 0\) \+ 1/)
  assert.match(reducer, /message\.speechResetReason = event\.properties\.reason/)
  assert.match(speech, /invalidateMessageSpeech\(/)
  assert.match(speech, /synthesisSchedulerRef\.current\.cancelLane\(messageId\)/)
  assert.match(speech, /playbackQueueRef\.current\.cancelScope\(messageId\)/)
  assert.doesNotMatch(speech, /streamRevisionRef/)
})
