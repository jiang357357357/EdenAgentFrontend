const assert = require("node:assert/strict")
const test = require("node:test")
const { build } = require("esbuild")
const { spawn } = require("node:child_process")
const { mkdtemp, rm } = require("node:fs/promises")
const { tmpdir } = require("node:os")
const path = require("node:path")

function runRenderer(scratch) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.NODE_OPTIONS
    const child = spawn(require("electron"), [path.join(__dirname, "fixtures/clipboard-renderer-main.cjs"), scratch], {
      windowsHide: true, env, stdio: ["ignore", "pipe", "pipe"],
    })
    let output = "", errors = ""
    const timer = setTimeout(() => { child.kill(); reject(new Error("Clipboard renderer timed out")) }, 45_000)
    child.stdout.on("data", chunk => { output += chunk })
    child.stderr.on("data", chunk => { errors += chunk })
    child.on("error", error => { clearTimeout(timer); reject(error) })
    child.on("exit", code => {
      clearTimeout(timer)
      const line = output.split(/\r?\n/).find(value => value.startsWith("EDEN_CLIPBOARD_RESULT="))
      if (code !== 0 || !line) reject(new Error(`Clipboard renderer failed (${code}): ${errors.slice(-4000)}`))
      else resolve(JSON.parse(line.slice("EDEN_CLIPBOARD_RESULT=".length)))
    })
  })
}

test("reply copy works through the real desktop preload and IPC when browser permission is denied", {
  timeout: 60_000, skip: process.platform !== "win32" ? "Windows desktop acceptance" : false,
}, async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "eden-desktop-clipboard-"))
  try {
    await build({ absWorkingDir: path.resolve(__dirname, "../../web"),
      entryPoints: ["tests/fixtures/desktop-clipboard-renderer.tsx"], outfile: path.join(scratch, "renderer.js"),
      bundle: true, format: "iife", platform: "browser", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"development"' },
    })
    const result = await runRenderer(scratch)
    assert.equal(result.browserError, "NotAllowedError")
    assert.equal(result.copied, true)
    assert.deepEqual(result.writes, [result.text])
    assert.equal(result.text, "**完整回答**\n中文、emoji 😊\n  代码\\路径\n")
  } finally {
    if (path.dirname(path.resolve(scratch)) !== path.resolve(tmpdir())) throw new Error("Unexpected clipboard cleanup path")
    await rm(scratch, { recursive: true, force: true })
  }
})
