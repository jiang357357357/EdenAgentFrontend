import assert from "node:assert/strict"
import test from "node:test"

import {
  hasAssistantDetail,
  resolveConversationAssistant,
} from "../src/lib/assistant-detail.ts"

const summary = {
  id: 9,
  name: "摘要助手",
  character: { id: 15, name: "摘要角色", visual_preference: "spine" },
}
const detail = {
  id: 9,
  name: "详情助手",
  character: {
    id: 15,
    name: "详情角色",
    visual_preference: "spine",
    visual_actions: [],
    costumes: [{ id: 1, costume_id: "original", spine_assets: [] }],
    spine_assets: [{ id: 15, costume_key: "original", layout: "standee" }],
  },
}

test("a complete current assistant wins over its matching roster summary", () => {
  assert.equal(resolveConversationAssistant(detail, [summary], 9), detail)
})

test("assistant detail detection rejects a roster summary", () => {
  assert.equal(hasAssistantDetail(summary), false)
  assert.equal(hasAssistantDetail(detail), true)
})

test("a hydrated conversation participant wins when it differs from current", () => {
  const otherDetail = { ...detail, id: 10 }
  assert.equal(resolveConversationAssistant(detail, [summary, otherDetail], 10), otherDetail)
})
