import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const api = readFileSync(new URL("../../../Server/crates/eden-agent-api/src/lib.rs", import.meta.url), "utf8")
const store = readFileSync(new URL("../../../Server/crates/eden-agent-store/src/lib.rs", import.meta.url), "utf8")
const turnPreparation = readFileSync(new URL("../../../Server/crates/eden-agent-app/src/runtime/turn/prepare.rs", import.meta.url), "utf8")
const client = readFileSync(new URL("../src/lib/agent-client.ts", import.meta.url), "utf8")

test("authenticated user environment follows session create and each new root turn", () => {
  assert.match(api, /pub struct SessionEnvironment/)
  assert.match(api, /pub environment: Option<SessionEnvironment>/)
  assert.match(client, /function currentSessionEnvironment\(\)/)
  assert.match(client, /session\.create", \{ title: "", participants, environment \}/)
  assert.match(client, /"turn\.start"[\s\S]*environment: currentSessionEnvironment\(\)/)
})

test("session environment is durable and enters the model context without raw coordinates", () => {
  assert.match(store, /environment_json/)
  assert.match(store, /session\.environment_updated/)
  assert.match(turnPreparation, /compile_system_prompt\([\s\S]*&session\.environment/)
  assert.doesNotMatch(
    readFileSync(new URL("../../../Server/crates/eden-agent-app/src/prompt.rs", import.meta.url), "utf8"),
    /用户地点[^\n]*latitude|用户地点[^\n]*longitude/,
  )
})
