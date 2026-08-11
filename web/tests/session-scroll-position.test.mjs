import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const chatPageSource = readFileSync(new URL("../src/pages/chat/ChatPage.tsx", import.meta.url), "utf8")
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")

test("session switches anchor at the bottom without inheriting smooth scrolling", () => {
  assert.doesNotMatch(chatPageSource, /overflow-y-auto scroll-smooth/)
  assert.match(appSource, /element\.scrollTop = element\.scrollHeight/)
})

test("chat history keeps ten complete conversation turns and moves five turns at a time", () => {
  assert.match(chatPageSource, /VISIBLE_CONVERSATION_TURNS = 10/)
  assert.match(chatPageSource, /CONVERSATION_TURN_STEP = 5/)
  assert.match(chatPageSource, /message\.role === "user"/)
  assert.match(chatPageSource, /messages\.slice\(visibleMessageStart, visibleMessageEnd\)/)
  assert.match(chatPageSource, /moveConversationWindow\("older"\)/)
  assert.match(chatPageSource, /moveConversationWindow\("newer"\)/)
})
