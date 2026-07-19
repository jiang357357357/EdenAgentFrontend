import assert from "node:assert/strict"
import test from "node:test"

import { presentRuntimeError } from "../src/lib/runtime-error.ts"

test("SSL EOF is presented as a readable model connection failure", () => {
  const detail = "<urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol>"
  const error = presentRuntimeError({ message: detail }, "opencode-go", "mimo-v2.5")

  assert.equal(error.title, "模型连接失败")
  assert.match(error.message, /远端提前断开/)
  assert.equal(error.detail, detail)
  assert.equal(error.model, "opencode-go/mimo-v2.5")
})

test("timeout is distinguished from a generic runtime error", () => {
  const error = presentRuntimeError({ message: "The request timed out" })

  assert.equal(error.title, "模型请求超时")
  assert.match(error.message, /限定时间/)
})
