import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const composerSource = await readFile(
  new URL("../src/components/chat/input/ChatComposerFooter.tsx", import.meta.url),
  "utf8",
)

test("normal chat keeps the context meter outside, to the right, and bottom-anchored", () => {
  assert.match(
    composerSource,
    /className="absolute bottom-\[[\d.]+vh\] right-\[-[\d.]+vh\][^"]*">\s*<ReplyTimer\b[^>]*\/>\s*<TokenMeter\b/,
  )
})
