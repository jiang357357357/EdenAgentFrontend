import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const sidebarSource = await readFile(
  new URL("../src/components/layout/Sidebar.tsx", import.meta.url),
  "utf8",
)

test("session avatars render the fallback icon only when the image is unavailable", () => {
  assert.match(sidebarSource, /const showAvatar = Boolean\(avatarUrl && failedAvatarUrl !== avatarUrl\)/)
  assert.match(
    sidebarSource,
    /\{showAvatar \? \([\s\S]*?<img[\s\S]*?\) : \([\s\S]*?<MessageSquare[\s\S]*?\)\}/,
  )
  assert.doesNotMatch(sidebarSource, /currentTarget\.style\.display/)
})
