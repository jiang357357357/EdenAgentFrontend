import assert from "node:assert/strict"
import { test } from "node:test"
import { ObjectUrlScope } from "../src/lib/object-url-scope.ts"

test("audio scopes deduplicate loads and retain URLs until their owner releases them", async () => {
  const scope = new ObjectUrlScope()
  let loads = 0
  const load = async () => { loads++; return new Blob(["audio"]) }
  const first = scope.resolve("local:one", load)
  assert.equal(first, scope.resolve("local:one", load))
  const url = await first
  assert.equal(loads, 1)
  assert.equal(await (await fetch(url)).text(), "audio")
  scope.dispose()
  scope.dispose()
  await assert.rejects(fetch(url))
  await assert.rejects(scope.resolve("local:one", load), { name: "AbortError" })
})

test("disposing a scope during a load cancels it and rejects late results", async () => {
  const scope = new ObjectUrlScope()
  let complete
  let signal
  const pending = scope.resolve("mon:one", (nextSignal) => {
    signal = nextSignal
    return new Promise((resolve) => { complete = resolve })
  })
  await Promise.resolve()
  scope.dispose()
  assert.equal(signal.aborted, true)
  complete(new Blob(["late audio"]))
  await assert.rejects(pending, { name: "AbortError" })
})

test("failed loads retry and independent scopes cannot revoke each other's playback", async () => {
  const first = new ObjectUrlScope()
  const second = new ObjectUrlScope()
  await assert.rejects(first.resolve("local:one", async () => { throw Error("offline") }))
  const load = async () => new Blob(["audio"])
  const firstUrl = await first.resolve("local:one", load)
  const secondUrl = await second.resolve("local:one", load)
  assert.notEqual(firstUrl, secondUrl)
  first.dispose()
  assert.equal(await (await fetch(secondUrl)).text(), "audio")
  second.dispose()
})
