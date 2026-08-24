import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [pageSource, stageSource, desktopWindowSource, preloadSource, mainSource, webMainSource, cssSource] = await Promise.all([
  readFile(new URL("../src/pages/character/CharacterPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/desktop-pet/DesktopPetStage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/desktop-window.ts", import.meta.url), "utf8"),
  readFile(new URL("../../desktop/src/preload.cjs", import.meta.url), "utf8"),
  readFile(new URL("../../desktop/src/main.cjs", import.meta.url), "utf8"),
  readFile(new URL("../src/main.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/index.css", import.meta.url), "utf8"),
])

test("the panel and collapsed icon are separate fixed native windows", () => {
  assert.match(mainSource, /let petBubbleIconWindow = null/)
  assert.match(mainSource, /function createPetBubbleWindows\(\) \{[\s\S]*?createPetBubblePanelWindow\(\)[\s\S]*?createPetBubbleIconWindow\(\)/)
  assert.match(mainSource, /const bounds = petWindowLayout\(\)\.expandedBubble[\s\S]*?loadWebApp\(petBubbleWindow, "pet-bubble"\)/)
  assert.match(mainSource, /const bounds = petWindowLayout\(\)\.collapsedBubble[\s\S]*?loadWebApp\(petBubbleIconWindow, "pet-icon"\)/)
})

test("the character has a higher native stacking level than independent chat surfaces", () => {
  assert.doesNotMatch(mainSource, /parent: petWindow/)
  assert.match(mainSource, /PET_CHARACTER_TOPMOST_LEVEL = "screen-saver"/)
  assert.match(mainSource, /PET_INTERACTION_TOPMOST_LEVEL = "floating"/)
  assert.match(mainSource, /targetWindow === petWindow[\s\S]*?PET_CHARACTER_TOPMOST_LEVEL[\s\S]*?PET_INTERACTION_TOPMOST_LEVEL/)
})

test("collapse switches fixed-window visibility without resizing or reconfiguring the HWND", () => {
  const collapseHandler = mainSource.match(
    /set_pet_bubble_collapsed: \(\{ sender, args \}\) => \{([\s\S]*?)set_pet_bubble_keyboard_focus:/,
  )?.[1]
  assert.ok(collapseHandler)
  assert.match(collapseHandler, /applyPetBubbleVisibility\(\)/)
  assert.doesNotMatch(collapseHandler, /applyPetBubbleBounds|setBounds|setSize|setFocusable|setAlwaysOnTop|moveTop/)
})

test("fixed renderer routes have deterministic content and need no async collapse synchronization", () => {
  assert.match(pageSource, /surface === "icon" \? true : surface === "bubble" \? false/)
  assert.match(pageSource, /surface === "bubble" \? \([\s\S]*?<DesktopPetChatBubble/)
  assert.doesNotMatch(pageSource, /waitForNextPaint|getDesktopPetBubbleCollapsed|listenDesktopPetBubbleCollapsed/)
  assert.match(stageSource, /const bubbleOnly = surface === "bubble" \|\| surface === "icon"/)
})

test("Electron owns the collapse state and broadcasts it to both fixed surfaces", () => {
  assert.match(mainSource, /get_pet_bubble_collapsed: \(\) => petBubbleCollapsed/)
  assert.match(mainSource, /broadcastPetBubbleCollapsed\(\)/)
  assert.match(mainSource, /targetWindow === petBubbleWindow \|\| targetWindow === petBubbleIconWindow/)
  assert.match(preloadSource, /onPetBubbleCollapsed\(callback\)/)
  assert.match(desktopWindowSource, /getDesktopPetBubbleCollapsed/)
  assert.match(desktopWindowSource, /listenDesktopPetBubbleCollapsed/)
})

test("both dedicated interaction documents are transparent before React mounts", () => {
  assert.match(webMainSource, /initialPage === 'pet-bubble' \|\| initialPage === 'pet-icon'/)
  assert.match(webMainSource, /classList\.toggle\('pet-bubble-surface'/)
  assert.match(cssSource, /html\.pet-bubble-surface #root > \*/)
  assert.match(cssSource, /background-color: transparent !important/)
})

test("dragging the collapsed icon moves the whole pet group without turning the gesture into a click", () => {
  assert.match(stageSource, /Math\.hypot\([\s\S]*?\) >= 5/)
  assert.match(stageSource, /beginDesktopPetGroupDrag\(event\.screenX, event\.screenY\)/)
  assert.match(stageSource, /updateDesktopPetGroupDrag\(point\.x, point\.y\)/)
  assert.match(stageSource, /endDesktopPetGroupDrag\(event\.screenX, event\.screenY\)/)
  assert.match(stageSource, /suppressIconClickUntilRef\.current = performance\.now\(\) \+ 250/)
  assert.match(mainSource, /begin_pet_group_drag: \(\{ sender, args \}\) =>/)
  assert.match(mainSource, /draggingCollapsedIcon = targetWindow === petBubbleIconWindow && petBubbleCollapsed/)
  assert.match(mainSource, /draggingCharacter = targetWindow === petWindow && petSettings\.characterDraggable/)
  assert.match(mainSource, /petSettings = normalizePetSettings\(\{ \.\.\.petSettings, windowX: position\.x, windowY: position\.y \}\)/)
})

test("the Linux character uses a stable shaped work-area host", () => {
  assert.match(mainSource, /calculatePetWindowHostLayout\(layout\.character, layout\.workArea, process\.platform\)/)
  assert.match(mainSource, /petWindow\.setShape\(hostLayout\.shape\)/)
  assert.match(mainSource, /webContents\.send\("eden-agent-pet-character-viewport", petCharacterViewport\)/)
  assert.match(preloadSource, /onPetCharacterViewport\(callback\)/)
  assert.match(desktopWindowSource, /getDesktopPetCharacterViewport/)
  assert.match(pageSource, /listenDesktopPetCharacterViewport/)
  assert.match(stageSource, /workAreaHosted = characterOnly && characterViewport\.mode === "work-area"/)
  assert.doesNotMatch(stageSource, /translate\(/)
})
