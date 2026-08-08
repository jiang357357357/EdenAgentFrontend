import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [pageSource, rendererSource, spineSource, imageSource] = await Promise.all([
  readFile(new URL("../src/pages/assistant-switcher/AssistantSwitcherPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/character/renderer/CharacterVisualRenderer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/character/renderer/spine/SpineCharacterCanvas.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/character/renderer/CharacterStandeeImage.tsx", import.meta.url), "utf8"),
])

test("assistant switcher delegates the selected character preview to the unified visual renderer", () => {
  assert.match(
    pageSource,
    /import\s+\{\s*CharacterVisualRenderer\s*\}\s+from\s+"..\/..\/components\/character\/renderer"/,
  )
  assert.match(pageSource, /<CharacterVisualRenderer\s+[\s\S]*?character=\{preview\.character\}/)
  assert.doesNotMatch(pageSource, /<motion\.img\b/)
  assert.match(pageSource, /fetchAssistants\(token, \{ summary: true \}\)/)
  assert.match(pageSource, /fetchAssistant\(token, selectedId\)/)
  assert.match(pageSource, /renderQuality="preview"/)
})

test("assistant switcher loads first, then removes the current preview before entering the next", () => {
  assert.match(pageSource, /const \[displayedVisualKey,\s*setDisplayedVisualKey\] = useState/)
  assert.match(pageSource, /const \[visualTransitionPhase,\s*setVisualTransitionPhase\]/)
  assert.match(pageSource, /setVisualTransitionPhase\("leaving"\)/)
  assert.match(pageSource, /setDisplayedVisualKey\(transitionTargetKey\)[\s\S]*?setVisualTransitionPhase\("entering"\)/)
  assert.match(pageSource, /const isLeaving = isDisplayed && visualTransitionPhase === "leaving"/)
  assert.match(pageSource, /onReady=\{\(\) => handleVisualReady\(preview\.key\)\}/)
  assert.match(pageSource, /\(selectedIsCurrent && !appearanceDirty\) \|\| !selectedVisualReady/)
  assert.match(pageSource, /strictSpineSelection/)
  assert.match(pageSource, /正在准备…/)
})

test("static and Spine renderers propagate readiness through the unified renderer", () => {
  assert.match(rendererSource, /<CharacterStandeeImage[\s\S]*?onReady=\{onReady\}/)
  assert.match(rendererSource, /<LazySpineCharacterCanvas[\s\S]*?onReady=\{onReady\}/)
  assert.match(imageSource, /onReadyRef\.current\?\.\(\)/)
  assert.match(spineSource, /onReadyRef\.current\?\.\(\)/)
})

test("assistant preview Spine uses a bounded resolution and frame rate", () => {
  assert.match(rendererSource, /renderQuality=\{renderQuality\}/)
  assert.match(spineSource, /renderQuality === "preview" \? 1\.25 : 2/)
  assert.match(spineSource, /renderQuality === "preview" \? 15 : 24/)
})

test("a missing Spine layout never falls through to the standee renderer", () => {
  assert.match(rendererSource, /!resolveSpineLayout\(spineAsset\.layout\)/)
  assert.doesNotMatch(spineSource, /resolveSpineLayout\(asset\.metadata/)
})

test("Spine stays visually empty until its first fitted frame is ready", () => {
  assert.match(rendererSource, /<Suspense fallback=\{null\}>/)
  assert.doesNotMatch(rendererSource, /<Suspense fallback=\{renderFallback/)
  assert.match(spineSource, /setReady\(true\)[\s\S]*?onReadyRef\.current\?\.\(\)/)
  assert.match(spineSource, /!ready && "pointer-events-none opacity-0"/)
  assert.doesNotMatch(spineSource, /正在加载动态角色/)
})

test("memory-lobby Spine skips its intro and renders against a stable covered camera", () => {
  assert.match(spineSource, /name\.toLowerCase\(\) === "start_idle_01"/)
  assert.match(spineSource, /layoutRef\.current !== "memory-lobby"/)
  assert.match(spineSource, /setAnimation\(0, idleAnimation, true\)/)
  assert.match(spineSource, /calculateSpinePlacement\(/)
  assert.match(spineSource, /getAttachmentBounds\(loaded\.spine, slotName\)/)
  assert.match(spineSource, /cameraBoundsRef\.current/)
  assert.doesNotMatch(spineSource, /skeletonData\.width/)
  assert.match(spineSource, /fit: memoryLobby \? "cover" : "contain"/)
  assert.match(spineSource, /"overflow-hidden"/)
})

test("memory-lobby interactions require a press and schedule passive animation independently", () => {
  assert.doesNotMatch(spineSource, /onPointerEnter=/)
  assert.match(spineSource, /if \(interaction\.pointerId !== event\.pointerId\) return/)
  assert.match(spineSource, /interaction\.pressedZone !== "eye"/)
  assert.match(spineSource, /playHeldInteraction\([\s\S]*?animations\.pinchHoldMain/)
  assert.match(spineSource, /scheduleBlink\(3_000\)/)
  assert.match(spineSource, /randomSpineDelayMs\(12, 15\)/)
  assert.match(spineSource, /randomSpineDelayMs\(70, 80\)/)
})
