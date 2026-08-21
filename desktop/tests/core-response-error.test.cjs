const assert = require("node:assert/strict")
const test = require("node:test")

const { parseCoreError } = require("../src/ipc/core-response-error.cjs")

function response({ status = 500, statusText = "Internal Server Error", contentType = "", body = "" } = {}) {
  return {
    status,
    statusText,
    headers: { get: () => contentType },
    text: async () => body,
  }
}

test("preserves a structured MonCore error message", async () => {
  const message = await parseCoreError(response({
    status: 400,
    statusText: "Bad Request",
    contentType: "application/json",
    body: JSON.stringify({ error: "请求数据无效" }),
  }))

  assert.equal(message, "请求数据无效")
})

test("does not expose a Django debug HTML response", async () => {
  const message = await parseCoreError(response({
    contentType: "text/html; charset=utf-8",
    body: "<!doctype html><html><body>SECRET_API_KEY=unsafe</body></html>",
  }))

  assert.equal(message, "MonCore 接口返回服务器错误（500 Internal Server Error），请查看 MonCore 日志。")
  assert.doesNotMatch(message, /SECRET_API_KEY/)
})

test("does not expose a plain-text backend traceback", async () => {
  const message = await parseCoreError(response({
    contentType: "text/plain",
    body: "Traceback (most recent call last):\nSECRET_TOKEN=unsafe",
  }))

  assert.doesNotMatch(message, /SECRET_TOKEN|Traceback/)
})
