import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const connectorPage = readFileSync(new URL("../src/pages/connectors/ConnectorPage.tsx", import.meta.url), "utf8")
const agentClient = readFileSync(new URL("../src/lib/agent-client.ts", import.meta.url), "utf8")
const rpcTransport = readFileSync(new URL("../src/lib/rpc-transport.ts", import.meta.url), "utf8")

test("connector capability examples use the canonical camelCase tool contract", () => {
  assert.match(connectorPage, /arguments:\s*\{\s*connectorId: connector\.id,\s*query:/)
  assert.match(connectorPage, /arguments:\s*\{\s*connectorId: connector\.id,\s*action:/)
  assert.doesNotMatch(connectorPage, /connector_id/)
})

test("connector records use generated RPC types without a legacy view-model copy", () => {
  assert.match(agentClient, /ConnectorInfo as RpcConnectorInfo/)
  assert.match(agentClient, /export type Connector = RpcConnectorInfo/)
  assert.doesNotMatch(agentClient, /mapConnectorForView/)
  assert.doesNotMatch(rpcTransport, /mapConnectorForView/)
  assert.doesNotMatch(connectorPage, /connector_key|identity_key|desired_state|runtime_state|last_error/)
})
