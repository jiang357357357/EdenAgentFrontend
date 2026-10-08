import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" })
after(() => vite.close())
const [{ SharedWorkspaceBinding }, { SharedWorkspaceConflicts }, { SharedWorkspaceHistory }, { SharedWorkspaceMembers }, { SharedWorkspaceDevices }] = await Promise.all([
  "SharedWorkspaceBinding", "SharedWorkspaceConflicts", "SharedWorkspaceHistory", "SharedWorkspaceMembers", "SharedWorkspaceDevices",
].map(name => vite.ssrLoadModule(`/src/components/shared-workspace/${name}.tsx`)))
const noAction = () => assert.fail("Rendering cannot authorize sharing or modify data")
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const buttons = html => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
const space = { id: "space-1", name: "资料", role: "owner" }
const file = { fileId: "file-1", path: "note.txt", revision: 1, deleted: false, sha256: "a".repeat(64), size: 3 }
const { SharedWorkspacePageView } = await vite.ssrLoadModule("/src/pages/shared-workspace/SharedWorkspacePageView.tsx")
const { SharedWorkspaceLibraries } = await vite.ssrLoadModule("/src/pages/shared-workspace/SharedWorkspaceLibraries.tsx")
const pageOwner = status => ({ state: { status, spaces: [space], conflicts: [], members: [], files: [], history: [],
  devices: [], historyFileId: "", busy: false, loading: false, historyLoading: false, error: "", notice: "" },
  refresh: noAction, create: noAction, bind: noAction, sync: noAction, pause: noAction, revokeDevice: noAction,
  resolve: noAction, loadHistory: noAction, restore: noAction, setMember: noAction, removeMember: noAction })
const pageStatus = { available: true, canPublish: true, publishReason: null, bound: false, root: "E:/project", spaceId: null, state: "unbound",
  pending: 0, conflicts: 0, paused: false, lastSync: null, error: null, reason: null }

test("shared library opens as a two-column page without selecting or binding a library implicitly", () => {
  const html = render(SharedWorkspacePageView, { owner: pageOwner(pageStatus), root: pageStatus.root,
    onBack: noAction, onChooseWorkspace: noAction })
  assert.match(html, /<main[^>]*aria-labelledby="shared-workspace-title"/)
  assert.match(html, /返回会话/)
  for (const title of ["资料库列表", "搜索资料库", "新建资料库", "资料库详情", "先选择资料库"]) assert.match(html, new RegExp(title))
  assert.doesNotMatch(html, /<dialog|aria-modal|backdrop|>关闭</)
  assert.match(html, /aria-pressed="false"/)
  assert.doesNotMatch(html, /绑定并共享此目录/)
})

test("bound page preserves real sync state and management without binding controls", () => {
  const status = { ...pageStatus, bound: true, spaceId: space.id, state: "paused", paused: true, pending: 3, conflicts: 2 }
  const html = render(SharedWorkspacePageView, { owner: pageOwner(status), root: status.root, onBack: noAction, onChooseWorkspace: noAction })
  assert.match(html, /同步已暂停/)
  assert.match(html, /恢复自动同步/)
  for (const tab of ["冲突处理", "文件历史", "共享权限"]) assert.match(html, new RegExp(tab))
  assert.doesNotMatch(html, /绑定并共享此目录/)
  assert.ok(buttons(html).find(button => button[2].includes("立即同步") && /disabled=""/.test(button[1])))
})

test("a new account can choose its independent shared directory before it has a library or current workspace", () => {
  const owner = pageOwner({ ...pageStatus, root: '' }); owner.state.spaces = []
  const html = render(SharedWorkspacePageView, { owner, root: '', onBack: noAction, onChooseWorkspace: noAction })
  assert.match(html, /尚未选择独立共享目录/)
  assert.ok(buttons(html).find(button => button[2].includes('选择共享目录') && !/disabled=""/.test(button[1])))
  assert.doesNotMatch(html, /绑定并共享此目录/)
})

test("unavailable page exposes the service reason and return navigation without sharing actions", () => {
  const html = render(SharedWorkspacePageView, { owner: pageOwner({ ...pageStatus, available: false, reason: "DLC 尚未启用" }),
    root: pageStatus.root, onBack: noAction, onChooseWorkspace: noAction })
  assert.match(html, /DLC 尚未启用/)
  assert.match(html, /返回会话/)
  assert.match(html, /选择共享目录/)
  assert.doesNotMatch(html, /绑定并共享此目录|立即同步|撤销设备/)
})

test("the displayed directory can be confirmed directly while binding stays disabled until consent", () => {
  const html = render(SharedWorkspaceBinding, { root: "E:/managed-default", spaceId: space.id, busy: false,
    onBind: noAction, onChooseWorkspace: noAction })
  assert.match(html, /E:\/managed-default/)
  assert.match(html, /确认使用此共享目录/)
  assert.match(html, /aria-pressed="false"/)
  assert.doesNotMatch(html, /type="checkbox"[^>]*disabled=""/)
  assert.doesNotMatch(html, /checked=""/)
  const submit = buttons(html).find(button => button[2].includes("绑定并共享此目录"))
  assert.ok(submit && /disabled=""/.test(submit[1]))
  assert.match(html, /可同步的文件将共享给资料库成员/)
})

test("directory confirmation is unavailable without a directory or library, while busy, or for another binding", () => {
  for (const unavailable of [{ root: "" }, { spaceId: "" }, { busy: true }, { boundSpaceName: "已绑定资料库" }]) {
    const html = render(SharedWorkspaceBinding, { root: "E:/chosen", spaceId: space.id, busy: false,
      onBind: noAction, onChooseWorkspace: noAction, ...unavailable })
    assert.match(html, /type="checkbox"[^>]*disabled=""/)
    assert.doesNotMatch(html, /checked=""/)
    assert.ok(buttons(html).find(button => button[2].includes("绑定并共享此目录") && /disabled=""/.test(button[1])))
  }
})

test("a receiver without DLC keeps pairing and remote-library binding while local publication is disabled", () => {
  const owner = pageOwner({ ...pageStatus, canPublish: false, publishReason: "DLC 未安装" })
  owner.state.spaces = [{ ...space, role: "editor", hostName: "发布电脑" }]
  owner.state.network = { name: "接收电脑", deviceId: "receiver", addresses: [], listening: true, discoveryError: null, peers: [] }
  const html = render(SharedWorkspacePageView, { owner, root: pageStatus.root, onBack: noAction, onChooseWorkspace: noAction })
  assert.match(html, /接收方无需共享资料库 DLC/)
  assert.match(html, /确认配对设备/)
  assert.match(html, /选择资料库：资料/)
  assert.doesNotMatch(html, /共享资料库暂不可用/)
  assert.ok(buttons(html).find(button => button[2].includes("新建资料库") && /disabled=""/.test(button[1])))
  assert.ok(buttons(html).find(button => button[2].includes("创建配对邀请") && !/disabled=""/.test(button[1])))
})

test("library browser shows service permissions and current binding without made-up file counts", () => {
  const html = render(SharedWorkspaceLibraries, { spaces: [space, { id: "space-2", name: "设计素材", role: "viewer" }],
    selectedId: space.id, boundId: space.id, busy: false, onSelect: noAction, onCreate: noAction })
  assert.match(html, /所有者 · 当前目录已绑定/)
  assert.match(html, /只读/)
  assert.match(html, /aria-pressed="true"/)
  assert.doesNotMatch(html, /个文件|位成员|<select|自动同步/)
})

test("another library cannot replace a bound workspace and directory switching remains available", () => {
  const html = render(SharedWorkspaceBinding, { root: "E:/bound", spaceId: "space-2", busy: false, boundSpaceName: space.name,
    onBind: noAction, onChooseWorkspace: noAction })
  assert.match(html, /请另选共享目录/)
  assert.ok(buttons(html).find(button => button[2].includes("绑定并共享此目录") && /disabled=""/.test(button[1])))
  assert.ok(buttons(html).find(button => button[2].includes("确认使用此共享目录") && /disabled=""/.test(button[1])))
  assert.ok(buttons(html).find(button => button[2].includes("选择共享目录") && !/disabled=""/.test(button[1])))
})

test("read-only members can adopt a remote conflict but cannot publish their local version", () => {
  const conflict = { id: "conflict-1", path: "notes/<private>.txt", local: { ...file, baseRevision: 1 }, remote: { ...file, revision: 2 } }
  const html = render(SharedWorkspaceConflicts, { conflicts: [conflict], busy: false, canWrite: false, onResolve: noAction })
  const local = buttons(html).find(button => button[2].includes("保留本地版本"))
  const remote = buttons(html).find(button => button[2].includes("采用远端并保留本地备份"))
  assert.ok(local && /disabled=""/.test(local[1]))
  assert.ok(remote && !/disabled=""/.test(remote[1]))
  assert.match(html, /&lt;private&gt;/)
  assert.match(html, /不会自动覆盖/)
})

test("history restore is disabled for viewers while both data and deletion revisions remain visible", () => {
  const html = render(SharedWorkspaceHistory, { files: [file], versions: [file, { ...file, revision: 2, deleted: true }],
    fileId: file.fileId, loading: false, busy: false, canWrite: false, onSelect: noAction, onRestore: noAction })
  assert.match(html, /版本 1/)
  assert.match(html, /删除记录/)
  assert.ok(buttons(html).filter(button => button[2].includes("恢复此版本")).every(button => /disabled=""/.test(button[1])))
  assert.doesNotMatch(html, /确认恢复/)
})

test("owner member management keeps ownership immutable and new members default to viewer", () => {
  const html = render(SharedWorkspaceMembers, { members: [{ deviceId: "device-1", name: "发布电脑", role: "owner" }, { deviceId: "device-2", name: "接收电脑", role: "editor" }],
    busy: false, canManage: true, onSet: noAction, onRemove: noAction })
  assert.match(html, /发布设备/)
  assert.doesNotMatch(html, /发布电脑 的权限/)
  assert.match(html, /接收电脑 的权限/)
  assert.match(html, /<option value="viewer" selected="">只读<\/option>/)
  assert.ok(buttons(html).find(button => button[2].includes("授予或更新权限") && /disabled=""/.test(button[1])))
})

test("non-owners see members without active permission or removal controls", () => {
  const html = render(SharedWorkspaceMembers, { members: [{ deviceId: "device-2", name: "接收电脑", role: "editor" }], busy: false, canManage: false,
    onSet: noAction, onRemove: noAction })
  assert.match(html, /<select[^>]*disabled=""/)
  assert.doesNotMatch(html, /授予或更新权限/)
  assert.ok(buttons(html).every(button => /disabled=""/.test(button[1])))
})

test("device revocation is explicit and already revoked devices cannot be revoked again", () => {
  const html = render(SharedWorkspaceDevices, { devices: [{ deviceId: "device-1", name: "工作电脑", revoked: false },
    { deviceId: "device-2", name: "旧电脑", revoked: true }], busy: false, onRevoke: noAction })
  assert.match(html, /已撤销/)
  assert.equal(buttons(html).filter(button => button[2].includes("撤销配对")).length, 1)
  assert.doesNotMatch(html, /确认撤销<\/button>/)
  assert.match(html, /撤销配对会移除此设备对本机资料库的权限/)
  assert.match(html, /已配对/)
  assert.doesNotMatch(html, /已连接|在线/)
})
