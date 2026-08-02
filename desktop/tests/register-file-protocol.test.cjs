const assert = require("node:assert/strict")
const test = require("node:test")

const { registerFileProtocol } = require("../src/protocols/register-file-protocol.cjs")

test("registerFileProtocol maps monagent-file requests to net.fetch", async () => {
  let scheme = null
  let handler = null
  const protocol = {
    handle(nextScheme, nextHandler) {
      scheme = nextScheme
      handler = nextHandler
    },
  }
  const fetched = []
  const net = {
    fetch(url) {
      fetched.push(url)
      return { ok: true }
    },
  }

  registerFileProtocol({ protocol, net })
  const result = handler({ url: "monagent-file:///D:/Mon/example.png" })

  assert.equal(scheme, "monagent-file")
  assert.deepEqual(result, { ok: true })
  assert.equal(fetched.length, 1)
  assert.match(fetched[0], /^file:\/\/\/D:\/Mon\/example\.png$/i)
})
