const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { createSpeechDiagnostics } = require("../src/speech/speech-diagnostics.cjs")

test("speech diagnostics persist bounded JSONL without raw oversized values", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mon-agent-speech-"))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "speech.jsonl")
  const diagnostics = createSpeechDiagnostics(filePath, {
    now: () => new Date("2026-08-21T00:00:00.000Z"),
  })

  assert.equal(diagnostics.append("renderer", "playback-failed", {
    segmentId: "segment-1",
    error: "x".repeat(2_000),
  }), true)

  const entry = JSON.parse(fs.readFileSync(filePath, "utf8").trim())
  assert.equal(entry.timestamp, "2026-08-21T00:00:00.000Z")
  assert.equal(entry.source, "renderer")
  assert.equal(entry.event, "playback-failed")
  assert.equal(entry.details.segmentId, "segment-1")
  assert.equal(entry.details.error.length, 512)
})
