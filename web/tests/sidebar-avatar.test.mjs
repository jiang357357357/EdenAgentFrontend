import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const sidebarSource = await readFile(
  new URL("../src/components/layout/VirtualSessionList.tsx", import.meta.url),
  "utf8",
)

test("session avatars render the fallback icon only when the image is unavailable", () => {
  assert.match(sidebarSource, /url && url !== failed \? <img/)
  assert.match(
    sidebarSource,
    /\{url && url !== failed \? <img[\s\S]*?onError=\{\(\) => setFailed\(url\)\}[\s\S]*?: <MessageSquare[\s\S]*?\/>\}/,
  )
  assert.doesNotMatch(sidebarSource, /currentTarget\.style\.display/)
})
