import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(
  new URL("../src/components/character/renderer/spine/SpineCharacterCanvas.tsx", import.meta.url),
  "utf8",
)

test("desktop pet Spine rendering is not stopped merely because its window is unfocused", () => {
  const tickerState = source.match(/const updateTickerState = \(\) => \{([\s\S]*?)\n    \}/)?.[1] ?? ""

  assert.match(tickerState, /document\.hidden/)
  assert.match(tickerState, /!isIntersecting/)
  assert.doesNotMatch(tickerState, /document\.hasFocus/)
  assert.doesNotMatch(source, /addEventListener\("(?:focus|blur)", handleVisibility\)/)
})
