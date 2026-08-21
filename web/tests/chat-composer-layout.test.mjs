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
    /right-\[-6\.2vh\][\s\S]*?items-end gap-\[3\.9vh\][\s\S]*?<div className="flex flex-col items-center gap-\[0\.9vh\]">[\s\S]*?<SendButton[\s\S]*?<\/div>\s*<div className="mb-\[0\.25vh\]">\s*<TokenMeter/,
  )
})
