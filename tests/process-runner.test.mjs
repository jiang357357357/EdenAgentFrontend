import assert from "node:assert/strict"
import { once } from "node:events"
import test from "node:test"
import {
  resolveNpmInvocation,
  spawnNpm,
} from "../Script/Project/process_runner.mjs"

test("Windows runs npm-cli.js with node.exe instead of spawning npm.cmd", () => {
  const npmCli = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`
  const invocation = resolveNpmInvocation(["--version"], {
    environment: { npm_execpath: npmCli },
    execPath: String.raw`C:\Program Files\nodejs\node.exe`,
    platform: "win32",
    fileExists: (candidate) => candidate === npmCli,
  })

  assert.equal(invocation.command, String.raw`C:\Program Files\nodejs\node.exe`)
  assert.deepEqual(invocation.args, [npmCli, "--version"])
  assert.equal(invocation.args.some((value) => /\.(?:cmd|bat)$/i.test(value)), false)
})

test("Windows falls back to the npm CLI installed beside node.exe", () => {
  const execPath = String.raw`C:\Node With Spaces\node.exe`
  const expectedCli = String.raw`C:\Node With Spaces\node_modules\npm\bin\npm-cli.js`
  const invocation = resolveNpmInvocation(["run", "dev"], {
    environment: { npm_execpath: String.raw`C:\Node With Spaces\npm.cmd` },
    execPath,
    platform: "win32",
    fileExists: (candidate) => candidate === expectedCli,
  })

  assert.equal(invocation.command, execPath)
  assert.deepEqual(invocation.args, [expectedCli, "run", "dev"])
})

test("Windows fails early with an actionable error when npm-cli.js is unavailable", () => {
  assert.throws(
    () => resolveNpmInvocation([], {
      environment: {},
      execPath: String.raw`C:\broken\node.exe`,
      platform: "win32",
      fileExists: () => false,
    }),
    /Unable to locate npm-cli\.js/,
  )
})

test("POSIX can fall back to the executable npm shim", () => {
  const invocation = resolveNpmInvocation(["run", "dev"], {
    environment: {},
    execPath: "/usr/bin/node",
    platform: "linux",
    fileExists: () => false,
  })

  assert.deepEqual(invocation, {
    command: "npm",
    args: ["run", "dev"],
    npmCli: null,
  })
})

test("POSIX discovers npm from the standard prefix lib directory", () => {
  const execPath = "/opt/node/bin/node"
  const expectedCli = "/opt/node/lib/node_modules/npm/bin/npm-cli.js"
  const invocation = resolveNpmInvocation(["--version"], {
    environment: {},
    execPath,
    platform: "linux",
    fileExists: (candidate) => candidate === expectedCli,
  })

  assert.deepEqual(invocation, {
    command: execPath,
    args: [expectedCli, "--version"],
    npmCli: expectedCli,
  })
})

test("the active npm installation can be spawned without a shell", async () => {
  const child = spawnNpm(["--version"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk) => {
    stdout += chunk
  })
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })

  const [exitCode] = await once(child, "close")
  assert.equal(exitCode, 0, stderr)
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+(?:[-+].+)?$/)
  assert.equal(child.spawnfile, process.execPath)
  assert.equal(child.spawnargs.some((value) => /\.(?:cmd|bat)$/i.test(value)), false)
})
