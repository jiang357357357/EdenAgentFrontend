import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"
import { formatReplyDuration } from "../src/lib/reply-duration.ts"

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" })
after(() => vite.close())
const { MessageBubble } = await vite.ssrLoadModule("/src/components/chat/message/MessageBubble.tsx")
const render = (message) => renderToStaticMarkup(createElement(MessageBubble, { message }))
const reply = { id: "reply-1", role: "assistant", content: "回答内容", timestamp: "12:00", replyDurationMs: 12_340 }

test("completed replies show elapsed time after raw output for both content layouts", () => {
  for (const message of [reply, { ...reply, segments: [{ id: "text-1", type: "text", content: reply.content, state: "done" }] }]) {
    const html = render(message)
    assert.match(html, /耗时 12\.3 秒/)
    assert.equal((html.match(/耗时 /g) ?? []).length, 1)
    assert.ok(html.indexOf("耗时 ") > html.indexOf("原始输出"))
    assert.doesNotMatch(html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/)?.[1] ?? "", /耗时/)
  }
})

test("streaming, user and untimed replies do not display a final duration", () => {
  for (const message of [
    { ...reply, isStreaming: true },
    { ...reply, role: "user" },
    { ...reply, replyDurationMs: undefined },
    { ...reply, replyDurationMs: -1 },
    { ...reply, replyDurationMs: Number.NaN },
    { ...reply, replyDurationMs: Number.POSITIVE_INFINITY },
  ]) assert.doesNotMatch(render(message), /耗时/)
})

test("elapsed time uses readable units and carries rounded seconds correctly", () => {
  for (const [milliseconds, expected] of [
    [0, "不到 1 秒"], [999, "不到 1 秒"], [1_000, "1.0 秒"], [12_340, "12.3 秒"],
    [59_940, "59.9 秒"], [59_999, "1 分 0 秒"], [83_200, "1 分 23 秒"],
    [3_723_200, "1 小时 2 分 3 秒"],
  ]) assert.equal(formatReplyDuration(milliseconds), expected)
})
