const { spawn } = require("node:child_process")
const path = require("node:path")

// Electron writes UTF-8 bytes even when an inherited Windows console uses code page 936.
// A Node parent decodes the pipes and uses its Unicode console writer instead.
const args = process.argv.slice(2)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(require("electron"), args.length ? args : [path.resolve(__dirname, "..")], {
  env, windowsHide: true, stdio: ["inherit", "pipe", "pipe"],
})
child.stdout.setEncoding("utf8").pipe(process.stdout, { end: false })
child.stderr.setEncoding("utf8").pipe(process.stderr, { end: false })

let closed = false
child.once("error", error => {
  process.stderr.write(`Electron 启动失败: ${error.message}\n`)
  process.exitCode = 1
})
child.once("close", (code, signal) => {
  closed = true
  if (code === null) process.stderr.write(`Electron 已退出，信号: ${signal}\n`)
  process.exitCode = code ?? 1
})
for (const signal of ["SIGINT", "SIGTERM", "SIGUSR2"]) {
  process.on(signal, () => { if (!closed) child.kill(signal) })
}
