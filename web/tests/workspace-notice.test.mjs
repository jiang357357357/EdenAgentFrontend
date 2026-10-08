import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", esbuild: { jsx: "automatic" } })
after(() => vite.close())
const { WorkspaceNotice } = await vite.ssrLoadModule("/src/components/layout/WorkspaceNotice.tsx")
const initial = { info: { name: "fixture", path: "E:/removed/<project>", status: "missing", kind: "external",
  defaultPath: "E:/default", error: "原文件夹已被移走", pendingPath: null }, entries: [], loading: false, busy: false, error: "" }
const render = state => renderToStaticMarkup(createElement(WorkspaceNotice, {
  state, onRetry() {}, onChoose() {}, onUseDefault() {},
}))

test("a missing external workspace shows its original path and all recovery actions in the shared notice", () => {
  const html = render(initial)
  assert.match(html, /role="alert"/)
  for (const text of ["工作区暂不可用", "E:/removed/&lt;project&gt;", "原文件夹已被移走", "重新读取", "重新选择文件夹", "回到默认工作区"]) assert.ok(html.includes(text), text)
  assert.doesNotMatch(html, /<project>|尚未打开文件夹/)
})

test("unselected folders have a neutral empty state and default recovery only appears when available", () => {
  const html = render({ ...initial, info: { ...initial.info, status: "unselected", path: "", error: null, defaultPath: null } })
  assert.match(html, /尚未打开文件夹/)
  assert.match(html, /role="status"/)
  assert.match(html, /重新选择文件夹/)
  assert.doesNotMatch(html, /原路径|回到默认工作区/)
})

test("busy recovery prevents repeated actions and displays its progress", () => {
  const html = render({ ...initial, busy: true })
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3)
  assert.match(html, /正在更新工作区/)
})

test("a healthy folder has no warning; transport failures retain its path and retry action", () => {
  const ready = { ...initial, info: { ...initial.info, status: "ready", error: null } }
  assert.equal(render(ready), "")
  const html = render({ ...ready, error: "网络请求失败" })
  assert.match(html, /网络请求失败/)
  assert.match(html, /原路径/)
  assert.match(html, /重新读取/)
})
