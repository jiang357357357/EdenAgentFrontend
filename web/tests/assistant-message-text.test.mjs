import assert from "node:assert/strict"
import test from "node:test"

import { stripAssistantSpeakerPrefix } from "../src/lib/assistant-message-text.ts"

test("removes the current assistant name used as a transcript label", () => {
  assert.equal(stripAssistantSpeakerPrefix("伊芙：早安，先生。", ["伊芙"]), "早安，先生。")
  assert.equal(stripAssistantSpeakerPrefix("**伊芙:** 早安，先生。", ["伊芙"]), "早安，先生。")
  assert.equal(stripAssistantSpeakerPrefix("【伊芙】：早安，先生。", ["伊芙"]), "早安，先生。")
})

test("does not remove a name used naturally inside the reply", () => {
  const text = "莉莉安说得很热闹，但伊芙还有一点要补充。"
  assert.equal(stripAssistantSpeakerPrefix(text, ["伊芙"]), text)
})

test("removes a generic assistant transcript label when the UI already shows identity", () => {
  assert.equal(stripAssistantSpeakerPrefix("助手：我来回答。", ["伊芙", "助手"]), "我来回答。")
})
