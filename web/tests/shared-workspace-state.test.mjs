import assert from "node:assert/strict"
import test from "node:test"
import { SharedWorkspaceStateOwner } from "../src/components/shared-workspace/shared-workspace-state.ts"
import { assertShareConsent, sharedWorkspaceLabel } from "../src/components/shared-workspace/shared-workspace-view.ts"

const ready = extra => ({ available: true, reason: null, canPublish: true, publishReason: null, bound: false, spaceId: null, paused: false,
  state: "unbound", pending: 0, conflicts: 0, lastSync: null, error: null, root: "E:/chosen", ...extra })
const space = { id: "space-1", name: "资料", role: "owner" }
const file = { fileId: "file-1", path: "note.txt", revision: 1, deleted: false, sha256: "a".repeat(64), size: 3 }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function fixture(overrides = {}, initial = ready()) {
  let current = true, status = initial
  const calls = [], publications = [], fileRefreshes = []
  const client = {
    isCurrent: () => current, invalidate: () => { current = false },
    status: async () => ({ ...status }), spaces: async () => [space], conflicts: async () => [],
    members: async () => [{ deviceId: "device-1", name: "本机", role: "owner" }], files: async () => [file], devices: async () => [],
    network: async () => ({ deviceId: "device-1", name: "本机", listening: true, addresses: [], discoveryError: null, peers: [] }),
    invitePairing: async () => { calls.push(["invite"]); return { code: "eden-lan2:test", expiresAt: 600_000 } },
    pairDevice: async (...args) => { calls.push(["pair", ...args]); return { paired: true } },
    create: async name => { calls.push(["create", name]); return { space } },
    bind: async id => { calls.push(["bind", id]); status = ready({ bound: true, spaceId: id, state: "idle" }); return status },
    sync: async () => { calls.push(["sync"]); return status },
    pause: async paused => { calls.push(["pause", paused]); status = { ...status, paused }; return status },
    resolve: async (...args) => { calls.push(["resolve", ...args]); return status },
    history: async id => { calls.push(["history", id]); return [file] },
    restore: async (...args) => { calls.push(["restore", ...args]); return status },
    setMember: async (...args) => { calls.push(["setMember", ...args]); return { members: [] } },
    removeMember: async (...args) => { calls.push(["removeMember", ...args]); return { members: [] } },
    revokeDevice: async (...args) => { calls.push(["revokeDevice", ...args]); return { revoked: true } },
    ...overrides,
  }
  const owner = new SharedWorkspaceStateOwner(client, () => publications.push(owner.state), () => fileRefreshes.push(true))
  return { owner, calls, publications, fileRefreshes, invalidate: () => { current = false }, status: value => { status = value } }
}

test("unavailable account or runtime displays its reason and never loads or mutates shared data", async () => {
  const unexpected = async () => assert.fail("unavailable DLC must not request spaces")
  const f = fixture({ spaces: unexpected }, ready({ available: false, reason: "未安装共享资料库" }))
  await f.owner.refresh(true)
  await f.owner.bind(space.id, "E:/chosen", true)
  await f.owner.create("name")
  assert.equal(sharedWorkspaceLabel(f.owner.state.status), "未安装共享资料库")
  assert.deepEqual(f.calls, [])
})

test("displaying a managed/default workspace never constitutes consent to share it", async () => {
  for (const [selected, confirmed] of [["", false], ["E:/chosen", false], ["E:/other", true]]) {
    const f = fixture()
    await f.owner.refresh()
    await f.owner.bind(space.id, selected, confirmed)
    assert.deepEqual(f.calls, [])
    assert.ok(f.owner.state.error)
  }
  assert.throws(() => assertShareConsent("", "", true), /明确选择/)
})

test("creating a space does not bind or upload; binding requires the selected root and confirmation", async () => {
  const f = fixture()
  await f.owner.refresh(true)
  assert.equal((await f.owner.create("  项目  ")).space.id, space.id)
  assert.deepEqual(f.calls, [["create", "项目"]])
  assert.equal(f.owner.state.status.bound, false)
  await f.owner.bind(space.id, "E:/chosen", true)
  assert.deepEqual(f.calls, [["create", "项目"], ["bind", space.id]])
  assert.equal(f.owner.state.status.bound, true)
})

test("duplicate mutation clicks share one pending action", async () => {
  const pending = deferred()
  let calls = 0
  const f = fixture({ sync: async () => { calls++; return pending.promise } })
  await f.owner.refresh()
  const first = f.owner.sync()
  await f.owner.sync()
  assert.equal(calls, 1)
  assert.equal(f.owner.state.busy, true)
  pending.resolve(ready())
  await first
  assert.equal(f.owner.state.busy, false)
})

test("disposed, switched-account, and reactivated owners reject stale reads", async () => {
  for (const mode of ["disposed", "identity", "reactivated"]) {
    const pending = deferred(), f = fixture({ status: () => pending.promise })
    const reading = f.owner.refresh(true)
    if (mode === "identity") f.invalidate()
    else f.owner.dispose()
    if (mode === "reactivated") f.owner.activate()
    const count = f.publications.length
    pending.resolve(ready({ root: "E:/stale" }))
    await reading
    assert.equal(f.publications.length, count)
    assert.equal(f.owner.state.status, null)
  }
})

test("scope change prevents action completion from refreshing or announcing success", async () => {
  const pending = deferred(), f = fixture({ bind: () => pending.promise })
  await f.owner.refresh()
  const binding = f.owner.bind(space.id, "E:/chosen", true)
  f.invalidate()
  const count = f.publications.length
  pending.resolve(ready({ bound: true }))
  await binding
  assert.equal(f.publications.length, count)
  assert.equal(f.owner.state.notice, "")
})

test("the newest status read wins over an older read", async () => {
  const pending = deferred()
  let reads = 0
  const f = fixture({ status: () => ++reads === 1 ? pending.promise : Promise.resolve(ready({ paused: true })) })
  const first = f.owner.refresh()
  await f.owner.refresh()
  pending.resolve(ready({ paused: false }))
  await first
  assert.equal(f.owner.state.status.paused, true)
})

test("listing failures preserve the actual status and surface a retriable error", async () => {
  const f = fixture({ members: async () => { throw new Error("发布设备离线") } }, ready({ bound: true, spaceId: space.id }))
  await f.owner.refresh(true)
  assert.equal(f.owner.state.status.bound, true)
  assert.equal(f.owner.state.error, "发布设备离线")
  await f.owner.refresh()
  assert.equal(f.owner.state.error, "")
})

test("an unreachable bound library does not discard updated local pairing and discovery information", async () => {
  const network = { deviceId: "local", name: "本机", listening: true, addresses: [], discoveryError: null,
    peers: [{ deviceId: "peer-new", name: "新电脑", paired: true, discovered: true, revoked: false, addresses: [] }] }
  const f = fixture({
    members: async () => { throw new Error("资料库权限已移除") },
    network: async () => network,
    devices: async () => [{ deviceId: "peer-new", name: "新电脑", revoked: false }],
    spaces: async () => [{ ...space, reachable: false }],
  }, ready({ bound: true, spaceId: space.id }))
  await f.owner.refresh(true, "background")
  assert.equal(f.owner.state.error, "资料库权限已移除")
  assert.deepEqual(f.owner.state.network, network)
  assert.equal(f.owner.state.devices[0].deviceId, "peer-new")
  assert.equal(f.owner.state.spaces[0].reachable, false)
})

test("pairing uses the supplied invitation and address without binding a local directory", async () => {
  const f = fixture()
  await f.owner.refresh(true)
  await f.owner.invitePairing()
  assert.equal(f.owner.state.invitation.code, "eden-lan2:test")
  assert.match(f.owner.state.notice, /尚未授予目录访问权限/)
  await f.owner.pairDevice("  eden-lan2:other  ", "  http://192.168.1.9:12345  ")
  assert.deepEqual(f.calls, [["invite"], ["pair", "eden-lan2:other", "http://192.168.1.9:12345"]])
  assert.equal(f.owner.state.status.bound, false)
  assert.deepEqual(f.fileRefreshes, [])
})

test("without publisher DLC the receiver can pair and bind a granted library but cannot create one", async () => {
  const f = fixture({}, ready({ canPublish: false, publishReason: "DLC 未安装" }))
  await f.owner.refresh(true)
  await f.owner.create("blocked")
  assert.deepEqual(f.calls, [])
  await f.owner.pairDevice("eden-lan2:publisher")
  await f.owner.bind(space.id, "E:/chosen", true)
  assert.deepEqual(f.calls, [["pair", "eden-lan2:publisher", undefined], ["bind", space.id]])
  assert.equal(f.owner.state.status.bound, true)
})

test("late pairing invitations never enter a switched account or disposed view", async () => {
  for (const mode of ["account", "disposed", "reactivated"]) {
    const pending = deferred(), f = fixture({ invitePairing: () => pending.promise })
    await f.owner.refresh(true)
    const inviting = f.owner.invitePairing()
    if (mode === "account") f.invalidate()
    else f.owner.dispose()
    if (mode === "reactivated") f.owner.activate()
    const count = f.publications.length
    pending.resolve({ code: "eden-lan2:stale", expiresAt: 600_000 })
    await inviting
    assert.equal(f.publications.length, count)
    assert.equal(f.owner.state.invitation, null)
    assert.equal(f.owner.state.notice, "")
  }
})

test("history responses cannot overwrite a newer file selection", async () => {
  const pending = deferred(), f = fixture({ history: id => id === "old" ? pending.promise : Promise.resolve([{ ...file, fileId: id }]) })
  const reading = f.owner.loadHistory("old")
  await f.owner.loadHistory("new")
  pending.resolve([{ ...file, fileId: "old" }])
  await reading
  assert.equal(f.owner.state.historyFileId, "new")
  assert.equal(f.owner.state.history[0].fileId, "new")
})

test("conflict decisions, pause, and member/device changes use service methods", async () => {
  const f = fixture({}, ready({ bound: true, spaceId: space.id }))
  await f.owner.refresh(true)
  await f.owner.resolve("conflict-1", "remote")
  await f.owner.resolve("conflict-2", "local")
  await f.owner.pause(true)
  await f.owner.setMember("device-5", "viewer")
  await f.owner.removeMember("device-5")
  await f.owner.revokeDevice("device-1")
  assert.deepEqual(f.calls, [["resolve", "conflict-1", "remote"], ["resolve", "conflict-2", "local"],
    ["pause", true], ["setMember", "device-5", "viewer"], ["removeMember", "device-5"], ["revokeDevice", "device-1"]])
})

test("restoring a version refreshes its actual history without editing local state as a substitute", async () => {
  const f = fixture({}, ready({ bound: true, spaceId: space.id }))
  await f.owner.refresh(true)
  await f.owner.restore(file.fileId, 1)
  assert.deepEqual(f.calls, [["restore", file.fileId, 1], ["history", file.fileId]])
  assert.equal(f.owner.state.history[0].revision, 1)
  assert.equal(f.fileRefreshes.length, 1)
})

test("file refresh follows completed sync but not a stale account's operation", async () => {
  const pending = deferred(), f = fixture({ sync: () => pending.promise })
  await f.owner.refresh()
  const syncing = f.owner.sync()
  f.invalidate()
  pending.resolve(ready())
  await syncing
  assert.deepEqual(f.fileRefreshes, [])
  const current = fixture()
  await current.owner.refresh()
  await current.owner.sync()
  assert.equal(current.fileRefreshes.length, 1)
})

test("offline, paused, pending and conflict statuses never claim a successful sync", () => {
  assert.match(sharedWorkspaceLabel(ready({ bound: true, state: "offline", lastSync: 100 })), /离线/)
  assert.match(sharedWorkspaceLabel(ready({ bound: true, paused: true })), /暂停/)
  assert.match(sharedWorkspaceLabel(ready({ bound: true, state: "conflict", conflicts: 2 })), /2 个冲突/)
  assert.match(sharedWorkspaceLabel(ready({ bound: true, pending: 3 })), /3 项待同步/)
})
