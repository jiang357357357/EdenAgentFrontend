import assert from "node:assert/strict"
import test from "node:test"
import { WorkspaceExplorerStateOwner } from "../src/components/layout/workspace-explorer-state.ts"

const info = (status = "ready", extra = {}) => ({ name: "project", path: "E:/missing-project", status,
  kind: "external", defaultPath: "E:/default", error: status === "ready" ? null : "文件夹已不存在", pendingPath: null, ...extra })
const directory = { root: "E:/default", path: "", entries: [{ name: "example.txt", path: "example.txt", type: "file", size: null }] }
const switched = { currentPath: "E:/default", pendingPath: null, pendingSessionId: null, requestedAt: null,
  updatedAt: 1, auditSessionId: "audit-session", createdAuditSession: true }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

function fixture(overrides = {}) {
  let revision = 1
  const calls = [], states = []
  const owner = new WorkspaceExplorerStateOwner({ revision: () => revision,
    info: async () => info(), list: async () => { calls.push("list"); return directory },
    switch: async (...args) => { calls.push(["switch", ...args]); return switched },
    useDefault: async (...args) => { calls.push(["default", ...args]); return switched },
    selected: id => calls.push(["selected", id]), changed: () => calls.push("changed"), ...overrides,
  }, state => states.push(state))
  return { owner, calls, states, changeIdentity: () => { revision++ } }
}

test("unavailable workspaces keep their original path and never request a directory listing", async () => {
  for (const status of ["missing", "inaccessible", "invalid", "unselected"]) {
    const f = fixture({ info: async () => info(status) })
    await f.owner.load()
    assert.equal(f.owner.state.info.path, "E:/missing-project")
    assert.equal(f.owner.state.info.status, status)
    assert.deepEqual(f.owner.state.entries, [])
    assert.deepEqual(f.calls, [])
    assert.equal(f.owner.state.loading, false)
  }
})

test("changing selected conversation disposes only its explorer and cannot publish a late directory from another session", async () => {
  const pending = deferred()
  const first = fixture({ info: () => pending.promise })
  const oldRead = first.owner.load()
  first.owner.dispose()
  const second = fixture({ info: async () => info('ready', { path: 'E:/second-session' }) })
  await second.owner.load()
  pending.resolve(info('ready', { path: 'E:/first-session' })); await oldRead
  assert.equal(first.owner.state.info, null)
  assert.equal(second.owner.state.info.path, 'E:/second-session')
  assert.deepEqual(second.owner.state.entries, directory.entries)
})

test("a folder picker from the previous conversation cannot write after a tab switch", async () => {
  const picker = deferred()
  const first = fixture()
  const choice = first.owner.choose('first-session', () => picker.promise)
  first.owner.dispose()
  const second = fixture()
  await second.owner.choose('second-session', async () => 'E:/second-choice')
  picker.resolve('E:/stale-first-choice'); await choice
  assert.deepEqual(first.calls, [])
  assert.ok(second.calls.some(call => Array.isArray(call) && call[0] === 'switch' && call[1] === 'second-session'))
})

test("retry reads recovered workspace information before fetching its files", async () => {
  let available = false
  const f = fixture({ info: async () => info(available ? "ready" : "missing") })
  await f.owner.load()
  available = true
  await f.owner.load()
  assert.deepEqual(f.owner.state.entries, directory.entries)
  assert.deepEqual(f.calls, ["list"])
})

test("background shared-file refresh preserves workspace identity without resetting tree loading", async () => {
  const f = fixture()
  await f.owner.load()
  const previousInfo = f.owner.state.info
  const start = f.states.length
  assert.equal(await f.owner.refreshFiles(), true)
  assert.equal(f.owner.state.info, previousInfo)
  assert.ok(f.states.slice(start).every(state => state.loading === false))
  assert.deepEqual(f.owner.state.entries, directory.entries)
})

test("background file refresh discards responses after a workspace reload or identity change", async () => {
  for (const cause of ["reload", "identity"]) {
    const pending = deferred()
    let listings = 0
    const f = fixture({ list: () => ++listings === 2 ? pending.promise : Promise.resolve(directory) })
    await f.owner.load()
    const refreshing = f.owner.refreshFiles()
    if (cause === "reload") await f.owner.load()
    else f.changeIdentity()
    const publications = f.states.length
    pending.resolve({ ...directory, entries: [{ name: "stale", path: "stale", type: "file" }] })
    assert.equal(await refreshing, false)
    assert.equal(f.states.length, publications)
    assert.deepEqual(f.owner.state.entries, directory.entries)
  }
})

test("directory failures preserve the folder identity and expose the error", async () => {
  const f = fixture({ list: async () => { throw new Error("fixture unreadable directory") } })
  await f.owner.load()
  assert.equal(f.owner.state.info.path, "E:/missing-project")
  assert.equal(f.owner.state.error, "fixture unreadable directory")
  assert.equal(f.owner.state.loading, false)
})

test("first-session folder choice and default recovery refresh even when their workspace event is missed", async () => {
  const f = fixture()
  await f.owner.choose(undefined, async () => "E:/new")
  assert.deepEqual(f.calls, [["switch", undefined, "E:/new"], ["selected", "audit-session"], "changed", "list"])
  f.calls.length = 0
  await f.owner.useDefault("existing-session")
  assert.deepEqual(f.calls, [["default", "existing-session"], ["selected", "audit-session"], "changed", "list"])
  assert.equal(f.owner.state.busy, false)
})

test("default recovery is unavailable when the host has no default workspace", async () => {
  const f = fixture({ info: async () => info("missing", { defaultPath: null }) })
  await f.owner.load()
  await f.owner.useDefault(undefined)
  assert.deepEqual(f.calls, [])
})

test("cancelling a directory picker does not create a session or change the workspace", async () => {
  const f = fixture()
  await f.owner.choose(undefined, async () => null)
  assert.deepEqual(f.calls, [])
  assert.equal(f.owner.state.busy, false)
})

test("switching worlds while the picker is open prevents the old choice from writing", async () => {
  const selected = deferred(), f = fixture()
  const pending = f.owner.choose(undefined, () => selected.promise)
  f.changeIdentity()
  const publications = f.states.length
  selected.resolve("E:/stale")
  await pending
  assert.deepEqual(f.calls, [])
  assert.equal(f.states.length, publications)
})

test("late workspace reads and listing failures cannot update a changed account", async () => {
  for (const stage of ["info", "list"]) {
    const pending = deferred(), f = fixture({ [stage]: () => pending.promise })
    const reading = f.owner.load()
    await Promise.resolve()
    f.changeIdentity()
    const publications = f.states.length
    if (stage === "info") pending.resolve(info())
    else pending.reject(new Error("old account failure"))
    await reading
    assert.equal(f.states.length, publications)
    assert.deepEqual(f.calls, [])
  }
})

test("late action success does not select another account's audit session or refresh its files", async () => {
  const pending = deferred(), f = fixture({ switch: () => pending.promise })
  const changing = f.owner.choose(undefined, async () => "E:/old-account")
  await Promise.resolve()
  f.changeIdentity()
  const publications = f.states.length
  pending.resolve(switched)
  await changing
  assert.deepEqual(f.calls, [])
  assert.equal(f.states.length, publications)
})

test("a newer retry replaces an older directory read instead of showing stale files", async () => {
  const oldListing = deferred()
  let listings = 0
  const f = fixture({ list: () => ++listings === 1 ? oldListing.promise : Promise.resolve(directory) })
  const oldRead = f.owner.load()
  await Promise.resolve()
  await f.owner.load()
  oldListing.resolve({ ...directory, entries: [{ name: "stale", path: "stale", type: "file" }] })
  await oldRead
  assert.deepEqual(f.owner.state.entries, directory.entries)
})

test("an unmounted explorer ignores pending work and duplicate recovery clicks share one action", async () => {
  const pending = deferred(), f = fixture({ switch: () => pending.promise })
  let pickerCalls = 0
  const select = async () => { pickerCalls++; return "E:/new" }
  const changing = f.owner.choose(undefined, select)
  await f.owner.choose(undefined, select)
  assert.equal(pickerCalls, 1)
  f.owner.dispose()
  const publications = f.states.length
  pending.resolve(switched)
  await changing
  assert.equal(f.states.length, publications)
  assert.deepEqual(f.calls, [])
})
