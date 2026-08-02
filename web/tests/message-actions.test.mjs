import assert from "node:assert/strict"
import test from "node:test"

import { parseActionDescription, splitActionLines } from "../src/lib/message-actions.ts"

test("recognizes standalone half-width and full-width parenthesized actions", () => {
  assert.equal(parseActionDescription("(凑近屏幕)"), "凑近屏幕")
  assert.equal(parseActionDescription("（歪头）"), "歪头")
})

test("recognizes and unwraps standalone Markdown emphasis actions", () => {
  assert.equal(parseActionDescription("*凑近屏幕*"), "凑近屏幕")
  assert.equal(parseActionDescription("_歪头_"), "歪头")
})

test("does not reinterpret inline explanations or emphasis as action blocks", () => {
  assert.equal(parseActionDescription("说明（仅供参考）"), null)
  assert.equal(parseActionDescription("这是一段 *强调文字*。"), null)
})

test("splits action lines from surrounding Markdown", () => {
  assert.deepEqual(splitActionLines("第一段\n\n*凑近屏幕*\n\n第二段"), [
    { action: false, content: "第一段" },
    { action: true, content: "凑近屏幕" },
    { action: false, content: "第二段" },
  ])
})

test("splits a trailing parenthesized action from dialogue", () => {
  assert.deepEqual(splitActionLines("不过……这次可不许把我晾在后台了，哼！（叉腰）"), [
    { action: false, content: "不过……这次可不许把我晾在后台了，哼！" },
    { action: true, content: "叉腰" },
  ])
})

test("keeps ordinary inline parenthetical explanations in dialogue", () => {
  assert.deepEqual(splitActionLines("这是版本说明（仅供参考）"), [
    { action: false, content: "这是版本说明（仅供参考）" },
  ])
})
