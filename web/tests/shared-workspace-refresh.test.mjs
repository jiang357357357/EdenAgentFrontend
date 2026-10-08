import assert from "node:assert/strict"
import test from "node:test"
import { SharedWorkspaceStateOwner } from "../src/components/shared-workspace/shared-workspace-state.ts"

const ready = extra => ({ available: true, reason: null, bound: false, spaceId: null, paused: false,
  state: "unbound", pending: 0, conflicts: 0, lastSync: null, error: null, root: "E:/chosen", ...extra })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function fixture(overrides = {}) {
  const publications = []
  const client = { isCurrent: () => true, status: async () => ready(),
    spaces: async () => [], conflicts: async () => [], members: async () => [], files: async () => [], devices: async () => [],
    network: async () => ({ deviceId: "device-1", name: "本机", listening: true, addresses: [], discoveryError: null, peers: [] }),
    ...overrides }
  const owner = new SharedWorkspaceStateOwner(client, () => publications.push(owner.state))
  return { owner, publications }
}

test("background details update never enters loading after the first snapshot", async () => {
  const pending = deferred()
  let held = false
  const f = fixture({ spaces: () => held ? pending.promise : Promise.resolve([]) })
  await f.owner.refresh(true)
  const first = f.publications.length
  held = true
  const reading = f.owner.refresh(true, "background")
  await Promise.resolve()
  assert.equal(f.owner.state.loading, false)
  pending.resolve([{ id: "space-1", name: "新资料库", role: "owner" }])
  await reading
  assert.ok(f.publications.slice(first).every(state => !state.loading && !state.busy))
  assert.equal(f.owner.state.spaces[0].name, "新资料库")
})

test("slow background reads are not overlapped or replaced by the next polling tick", async () => {
  const pending = deferred()
  let requests = 0
  const f = fixture({ status: () => ++requests === 1 ? Promise.resolve(ready()) : pending.promise })
  await f.owner.refresh(true)
  const reading = f.owner.refresh(true, "background")
  for (let tick = 0; tick < 12; tick++) await f.owner.refresh(true, "background")
  assert.equal(requests, 2)
  assert.equal(f.owner.state.loading, false)
  pending.resolve(ready({ bound: true, spaceId: "space-1", pending: 2, state: "idle" }))
  await reading
  assert.equal(f.owner.state.status.pending, 2)
})

test("manual refresh keeps its loading feedback and supersedes an older background response", async () => {
  const pending = deferred()
  let requests = 0
  const f = fixture({ status: () => ++requests === 2 ? pending.promise : Promise.resolve(ready({ pending: requests })) })
  await f.owner.refresh(true)
  const background = f.owner.refresh(true, "background")
  const manual = f.owner.refresh(true)
  assert.equal(f.owner.state.loading, true)
  await manual
  pending.resolve(ready({ pending: 99 }))
  await background
  assert.equal(f.owner.state.status.pending, 3)
  assert.equal(f.owner.state.loading, false)
})

test("polling skips a foreground load and an active mutation", async () => {
  const loading = deferred(), changing = deferred()
  let requests = 0
  const f = fixture({ status: () => ++requests === 1 ? loading.promise : Promise.resolve(ready()), create: () => changing.promise })
  const initial = f.owner.refresh(true)
  await f.owner.refresh(true, "background")
  assert.equal(requests, 1)
  loading.resolve(ready()); await initial
  const mutation = f.owner.create("资料库")
  await f.owner.refresh(true, "background")
  assert.equal(requests, 1)
  changing.resolve({ space: { id: "space-1" } }); await mutation
  assert.equal(f.owner.state.busy, false)
})

test("a failed background read preserves the snapshot and permits a later retry", async () => {
  let failed = false
  const f = fixture({ status: async () => { if (failed) throw new Error("暂时离线"); return ready({ pending: 3 }) } })
  await f.owner.refresh(true)
  failed = true
  await f.owner.refresh(true, "background")
  assert.equal(f.owner.state.loading, false)
  assert.equal(f.owner.state.status.pending, 3)
  assert.equal(f.owner.state.error, "暂时离线")
  failed = false
  await f.owner.refresh(true, "background")
  assert.equal(f.owner.state.error, "")
})

test("initial reads still show loading and scoped disposal discards a late background result", async () => {
  const pending = deferred()
  let held = true
  const f = fixture({ status: () => held ? pending.promise : Promise.resolve(ready()) })
  const initial = f.owner.refresh(true, "background")
  assert.equal(f.owner.state.loading, true)
  pending.resolve(ready()); await initial
  held = false
  const reading = f.owner.refresh(true, "background")
  f.owner.dispose()
  const count = f.publications.length
  await reading
  assert.equal(f.publications.length, count)
})
