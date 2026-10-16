const assert = require("node:assert/strict")
const test = require("node:test")
const { spawn } = require("node:child_process")
const { mkdtemp, readFile, rm } = require("node:fs/promises")
const { tmpdir } = require("node:os")
const path = require("node:path")

function launch(fixture, args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.NODE_OPTIONS
    // The launcher must also tolerate callers running from an Electron Node environment.
    env.ELECTRON_RUN_AS_NODE = "1"
    const child = spawn(process.execPath, [path.resolve(__dirname, "../Script/launch-electron.cjs"), fixture, ...args], {
      env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = "", stderr = ""
    child.stdout.setEncoding("utf8").on("data", text => { stdout += text })
    child.stderr.setEncoding("utf8").on("data", text => { stderr += text })
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Electron encoding fixture timed out: ${stderr}`)) }, 30_000)
    child.once("error", error => { clearTimeout(timer); reject(error) })
    child.once("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}

test("desktop launcher preserves real Chinese IPC errors and success values through preload and UTF-8 pipes", {
  timeout: 45_000, skip: process.platform !== "win32" ? "Windows desktop encoding acceptance" : false,
}, async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "eden-desktop-encoding-"))
  try {
    const result = await launch(path.join(__dirname, "fixtures/console-encoding-main.cjs"), [scratch])
    assert.equal(result.code, 0, result.stderr)
    const saved = JSON.parse(await readFile(path.join(scratch, "result.json"), "utf8"))
    assert.ok(saved.received.endsWith(saved.original))
    assert.deepEqual(saved.success, { text: saved.original })
    assert.ok(result.stdout.includes(saved.original), "stdout retains Chinese and emoji")
    assert.ok(result.stderr.includes(saved.original), "Electron's native error diagnostic retains Chinese and emoji")
    assert.ok(!result.stderr.includes("璇锋眰"))
  } finally {
    if (path.dirname(path.resolve(scratch)) !== path.resolve(tmpdir())) throw new Error("Unexpected encoding cleanup path")
    await rm(scratch, { recursive: true, force: true })
  }
})

test("desktop launcher preserves a nonzero Electron exit status and trailing UTF-8 output", {
  timeout: 45_000, skip: process.platform !== "win32" ? "Windows desktop encoding acceptance" : false,
}, async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "eden-desktop-encoding-exit-"))
  try {
    const fixture = path.join(scratch, "exit.cjs")
    await require("node:fs/promises").writeFile(fixture, `
const { app } = require('electron'); const path = require('node:path');
app.setPath('userData', path.join(__dirname, 'user-data'));
app.setPath('sessionData', path.join(__dirname, 'session-data'));
app.whenReady().then(async () => {
  for (const byte of Buffer.from('末尾中文 😊')) {
    process.stdout.write(Buffer.from([byte])); await new Promise(resolve => setTimeout(resolve, 1));
  }
  process.stderr.write('错误中文'); app.exit(7);
});`, "utf8")
    const result = await launch(fixture, [])
    assert.equal(result.code, 7)
    // Windows Electron may emit an initial blank line before loading the entry.
    assert.equal(result.stdout.replace(/^(?:\r?\n)+/, ""), "末尾中文 😊")
    assert.equal(result.stderr, "错误中文")
  } finally {
    if (path.dirname(path.resolve(scratch)) !== path.resolve(tmpdir())) throw new Error("Unexpected encoding cleanup path")
    await rm(scratch, { recursive: true, force: true })
  }
})
