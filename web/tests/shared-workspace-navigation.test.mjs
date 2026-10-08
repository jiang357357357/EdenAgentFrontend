import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createElement as h } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" })
after(() => vite.close())
const [{ SharedWorkspaceNavigation, sharedWorkspaceSections }, { SharedWorkspacePanel }, { SharedWorkspacePageView }] = await Promise.all([
  vite.ssrLoadModule("/src/pages/shared-workspace/SharedWorkspaceNavigation.tsx"),
  vite.ssrLoadModule("/src/pages/shared-workspace/SharedWorkspacePanel.tsx"),
  vite.ssrLoadModule("/src/pages/shared-workspace/SharedWorkspacePageView.tsx"),
])
const noAction = () => assert.fail("Rendering cannot navigate, bind files or change permissions")
const space = { id: "space-1", name: "资料", role: "owner" }
const status = { available: true, canPublish: true, publishReason: null, bound: true, spaceId: space.id, state: "paused",
  root: "E:/project", paused: true, pending: 3, conflicts: 2, lastSync: null, reason: null, error: null }
const owner = (overrides = {}, spaces = [space]) => ({ state: { status: { ...status, ...overrides }, spaces, members: [], files: [], conflicts: [],
  devices: [], history: [], historyFileId: "", busy: false, loading: false, historyLoading: false, error: "", notice: "" },
  refresh: noAction, create: noAction, bind: noAction, sync: noAction, pause: noAction, revokeDevice: noAction,
  resolve: noAction, loadHistory: noAction, restore: noAction, setMember: noAction, removeMember: noAction })
const render = (component, props) => renderToStaticMarkup(h(component, props))
const panel = (section, props = {}) => render(SharedWorkspacePanel, { section, owner: owner(), selected: space, root: status.root,
  busy: false, onSelect: noAction, onChooseWorkspace: noAction, onShowLibraries: noAction, ...props })

test("the navigation contains only shared-library functions and one current section", () => {
  for (const { id, label } of sharedWorkspaceSections) {
    const html = render(SharedWorkspaceNavigation, { active: id, prefix: "shared", pending: 3, conflicts: 2, onSelect: noAction })
    const current = [...html.matchAll(/<button\b([^>]*)>/g)].filter(match => match[1].includes('aria-current="page"'))
    assert.equal(current.length, 1)
    assert.ok(current[0][1].includes(`aria-label="${label}"`))
    assert.ok(current[0][1].includes(`aria-controls="shared-panel-${id}"`))
    assert.match(html, /aria-label="共享资料库功能"/)
    assert.doesNotMatch(html, /主导航|所有会话|值日生|退出登录|>插件</)
  }
})

test("the initial page shows library selection and keeps other function panels separate", () => {
  const html = render(SharedWorkspacePageView, { owner: owner(), root: status.root, onBack: noAction, onChooseWorkspace: noAction })
  const panels = [...html.matchAll(/<section\b([^>]*data-shared-workspace-section="[^"]+"[^>]*)>/g)]
  assert.equal(panels.length, 6)
  assert.equal(panels.filter(match => !match[1].includes('hidden=""')).length, 1)
  assert.ok(panels.find(match => match[1].includes('data-shared-workspace-section="libraries"')))
  assert.match(html, /资料库列表/)
  assert.doesNotMatch(html, /aria-label="主导航"|role="tablist"/)
})

test("sync section displays the actual bound-library status without mixing pairing and binding forms", () => {
  const html = panel("sync")
  assert.match(html, /当前资料库/)
  assert.match(html, /同步已暂停/)
  assert.match(html, /恢复自动同步/)
  assert.match(html, /待同步/)
  assert.doesNotMatch(html, /局域网设备配对|绑定并共享此目录|授予或更新权限/)
})

test("unbound or different-library sections never expose the bound library's controls", () => {
  for (const section of ["sync", "conflicts", "history", "members"]) {
    for (const props of [{ selected: undefined }, { selected: { ...space, id: "other" } }, { owner: owner({ bound: false, spaceId: null }) }]) {
      const html = panel(section, props)
      assert.match(html, /前往资料库/)
      assert.doesNotMatch(html, /立即同步|确认恢复|授予或更新权限|确认处理/)
    }
  }
})

test("device pairing remains accessible before a library is bound and without publisher DLC", () => {
  const html = panel("network", { selected: undefined, owner: owner({ bound: false, spaceId: null, canPublish: false }) })
  assert.match(html, /局域网设备配对/)
  assert.match(html, /本机与已配对设备/)
  assert.doesNotMatch(html, /前往资料库|新建资料库|绑定并共享此目录/)
})

test("conflicts, file history and permissions are distinct sections without nested navigation tabs", () => {
  for (const [section, label] of [["conflicts", "冲突处理"], ["history", "文件历史"], ["members", "共享权限"]]) {
    const html = panel(section)
    assert.match(html, new RegExp(`aria-label="${label}"`))
    assert.doesNotMatch(html, /role="tablist"|role="tab"|局域网设备配对|立即同步/)
    if (section !== "members") assert.doesNotMatch(html, /授予或更新权限/)
  }
})

test("read-only members retain permission boundaries after the navigation change", () => {
  const viewer = { ...space, role: "viewer" }
  const html = panel("members", { selected: viewer, owner: owner({}, [viewer]) })
  assert.match(html, /只读设备可接收文件与查看历史/)
  assert.doesNotMatch(html, /授予或更新权限|移除权限/)
})
