import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false, server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom", esbuild: { jsx: "automatic" } })
const { NoticeCard } = await vite.ssrLoadModule("/src/components/feedback/index.ts")
const { MessageErrorCard } = await vite.ssrLoadModule("/src/components/chat/message/MessageDetails.tsx")
after(async () => { await vite.close() })

function render(props) { return renderToStaticMarkup(createElement(NoticeCard, props)) }

test("notice cards expose a labeled status or alert with associated explanatory text", () => {
  for (const tone of ["info", "success", "warning", "error", "neutral"]) {
    const html = render({ tone, title: "连接状态", description: "会话记录仍然保留" })
    assert.ok(html.includes(`role="${tone === "error" ? "alert" : "status"}"`))
    const titleId = html.match(/aria-labelledby="([^"]+)"/)?.[1]
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1]
    assert.ok(titleId && html.includes(`id="${titleId}"`))
    assert.ok(descriptionId && html.includes(`id="${descriptionId}"`))
    assert.ok(html.includes("连接状态"))
    assert.ok(html.includes("会话记录仍然保留"))
  }
})

test("persistent business notices can opt out of live announcements with a group role", () => {
  const html = render({ tone: "error", role: "group", title: "已读提醒" })
  assert.match(html, /role="group"/)
  assert.doesNotMatch(html, /aria-atomic|aria-live|aria-describedby/)
})

test("technical details use a closed native disclosure and escape diagnostic text", () => {
  const html = render({ title: "请求失败", details: '<script>alert("fixture")</script>\n下一行' })
  assert.match(html, /<details(?:\s|>)/)
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|=|>)/)
  assert.match(html, /<summary[^>]*>查看详情<\/summary>/)
  assert.ok(html.includes("&lt;script&gt;"))
  assert.doesNotMatch(html, /<script>/)
  assert.ok(html.includes("下一行"))
})

test("busy notices remain announceable while retaining busy native actions and named dismissal buttons", () => {
  const html = render({ title: "正在恢复连接", busy: true, onDismiss: () => {},
    actions: createElement("button", { type: "button", disabled: true, "aria-busy": true }, "立即重试") })
  assert.match(html, /<section[^>]*role="status"/)
  assert.doesNotMatch(html, /<section[^>]*aria-busy/)
  assert.match(html, /<button[^>]*type="button"[^>]*disabled=""[^>]*aria-busy="true"[^>]*>立即重试<\/button>/)
  assert.match(html, /<button[^>]*type="button"[^>]*aria-label="关闭提示：正在恢复连接"/)
  const alert = render({ tone: "error", title: "连接异常，正在恢复", busy: true })
  assert.match(alert, /<section[^>]*role="alert"/)
  assert.doesNotMatch(alert, /<section[^>]*aria-busy/)
  assert.doesNotMatch(render({ title: "无需操作" }), /<button|<details|aria-busy/)
})

test("message errors retain the model badge, user explanation and technical disclosure", () => {
  const html = renderToStaticMarkup(createElement(MessageErrorCard, { error: {
    title: "模型请求超时", message: "请稍后重试", model: "fixture/model", detail: "Fixture timeout at request 1",
  } }))
  assert.match(html, /role="alert"/)
  for (const text of ["模型请求超时", "请稍后重试", "fixture/model", "查看技术详情", "Fixture timeout at request 1"]) {
    assert.ok(html.includes(text))
  }
})
