import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [pageSource, rendererSource, spineSource, imageSource] = await Promise.all([
  readFile(new URL("../src/pages/assistant-switcher/AssistantSwitcherPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/CharacterVisualRenderer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/SpineCharacterCanvas.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/CharacterStandeeImage.tsx", import.meta.url), "utf8"),
])

test("assistant switcher delegates the selected character preview to the unified visual renderer", () => {
  assert.match(
    pageSource,
    /import\s+\{\s*CharacterVisualRenderer\s*\}\s+from\s+"..\/..\/components\/CharacterVisualRenderer"/,
  )
  assert.match(pageSource, /<CharacterVisualRenderer\s+[\s\S]*?character=\{preview\.character\}/)
  assert.doesNotMatch(pageSource, /<motion\.img\b/)
})

test("assistant switcher loads first, then removes the current preview before entering the next", () => {
  assert.match(pageSource, /const \[displayedVisualKey,\s*setDisplayedVisualKey\] = useState/)
  assert.match(pageSource, /const \[visualTransitionPhase,\s*setVisualTransitionPhase\]/)
  assert.match(pageSource, /setVisualTransitionPhase\("leaving"\)/)
  assert.match(pageSource, /setDisplayedVisualKey\(transitionTargetKey\)[\s\S]*?setVisualTransitionPhase\("entering"\)/)
  assert.match(pageSource, /const isLeaving = isDisplayed && visualTransitionPhase === "leaving"/)
  assert.match(pageSource, /onReady=\{\(\) => handleVisualReady\(preview\.key\)\}/)
  assert.match(pageSource, /selectedIsCurrent \|\| !selectedVisualReady/)
  assert.match(pageSource, /正在准备…/)
})

test("static and Spine renderers propagate readiness through the unified renderer", () => {
  assert.match(rendererSource, /<CharacterStandeeImage[\s\S]*?onReady=\{onReady\}/)
  assert.match(rendererSource, /<LazySpineCharacterCanvas[\s\S]*?onReady=\{onReady\}/)
  assert.match(imageSource, /onReadyRef\.current\?\.\(\)/)
  assert.match(spineSource, /onReadyRef\.current\?\.\(\)/)
})

test("Spine stays visually empty until its first fitted frame is ready", () => {
  assert.match(rendererSource, /<Suspense fallback=\{null\}>/)
  assert.doesNotMatch(rendererSource, /<Suspense fallback=\{renderFallback/)
  assert.match(spineSource, /setReady\(true\)[\s\S]*?onReadyRef\.current\?\.\(\)/)
  assert.match(spineSource, /!ready && "pointer-events-none opacity-0"/)
  assert.doesNotMatch(spineSource, /正在加载动态角色/)
})
