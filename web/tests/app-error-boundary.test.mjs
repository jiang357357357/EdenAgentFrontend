import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [mainSource, boundarySource] = await Promise.all([
  readFile(new URL("../src/main.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/errors/AppErrorBoundary.tsx", import.meta.url), "utf8"),
])

test("the root application has a visible recovery boundary", () => {
  assert.match(mainSource, /<AppErrorBoundary petSurface=\{isPetSurface\}>/)
  assert.match(boundarySource, /聊天界面渲染失败/)
  assert.match(boundarySource, /window\.location\.reload\(\)/)
})

test("a root failure keeps native pet windows transparent", () => {
  assert.match(boundarySource, /this\.props\.petSurface[\s\S]*?classList\.add\("character-transparent"\)/)
  assert.match(boundarySource, /if \(this\.props\.petSurface\) return null/)
})
