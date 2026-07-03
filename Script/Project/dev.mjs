import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, "../..")
const agentRoot = path.resolve(frontendRoot, "..")
const configPath = path.join(agentRoot, ".monconfig")

const webPort = Number(process.env.MON_AGENT_WEB_PORT ?? readMonConfigValue("server", "WEB_PORT", "40091"))
const quitFlag = resolveAgentPath(readMonConfigValue("desktop", "QUIT_FLAG", ".artifacts/desktop-quit.flag"))
const children = []
let shuttingDown = false
let startedWeb = false

function readMonConfigValue(targetSection, targetKey, fallback) {
  let section = "default"
  let contents = ""
  try {
    contents = fs.readFileSync(configPath, "utf8")
  } catch {
    return fallback
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).trim().toLowerCase()
      continue
    }
    const equalsIndex = line.indexOf("=")
    if (equalsIndex < 0) continue
    const key = line.slice(0, equalsIndex).trim().toUpperCase()
    const value = line.slice(equalsIndex + 1).trim()
    if (section === targetSection.toLowerCase() && key === targetKey.toUpperCase()) {
      return value || fallback
    }
  }
  return fallback
}

function resolveAgentPath(value) {
  return path.isAbsolute(value) ? value : path.join(agentRoot, value)
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function prefixOutput(label, readable, stream) {
  if (!readable) return
  let pending = ""
  readable.setEncoding("utf8")
  readable.on("data", (chunk) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ""
    for (const line of lines) {
      if (line) stream.write(`[${label}] ${line}\n`)
    }
  })
  readable.on("end", () => {
    if (pending) stream.write(`[${label}] ${pending}\n`)
  })
}

function start(label, args, extraEnv = {}) {
  const child = spawn(npmCommand(), args, {
    cwd: frontendRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...extraEnv },
    detached: process.platform !== "win32",
    windowsHide: true,
  })
  children.push(child)
  prefixOutput(label, child.stdout, process.stdout)
  prefixOutput(label, child.stderr, process.stderr)
  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      process.stderr.write(`[dev] ${label} exited with code ${code}\n`)
      void shutdown(code || 1)
    }
  })
  return child
}

async function isWebReady() {
  try {
    const response = await fetch(`http://127.0.0.1:${Number.isFinite(webPort) ? webPort : 40091}`)
    return response.ok || response.status === 304
  } catch {
    return false
  }
}

async function waitForWeb(webProc) {
  let exited = false
  let exitCode = null
  webProc?.on("exit", (code) => {
    exited = true
    exitCode = code
  })

  for (let index = 0; index < 60; index += 1) {
    if (exited) {
      throw new Error(`web exited before ready, code: ${exitCode}`)
    }
    if (await isWebReady()) return
    await sleep(500)
  }
  throw new Error(`web did not become ready on port ${Number.isFinite(webPort) ? webPort : 40091}`)
}

async function runWithTimeout(args, timeoutMs) {
  return await new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), { cwd: frontendRoot, stdio: "ignore", windowsHide: true })
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.on("exit", () => {
      clearTimeout(timer)
      resolve()
    })
    child.on("error", () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function killProcessTree(proc) {
  if (!proc?.pid) return
  if (process.platform === "win32") {
    await runWithTimeout(["taskkill", "/PID", String(proc.pid), "/T", "/F"], 3000)
    return
  }
  try {
    process.kill(-proc.pid, "SIGTERM")
  } catch {
    proc.kill("SIGTERM")
  }
}

function writeQuitFlag() {
  fs.mkdirSync(path.dirname(quitFlag), { recursive: true })
  fs.writeFileSync(quitFlag, String(Date.now()), "utf8")
}

async function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  writeQuitFlag()
  for (const child of [...children].reverse()) {
    if (child.spawnargs.includes("--prefix") || startedWeb) {
      await killProcessTree(child)
    }
  }
  fs.rmSync(quitFlag, { force: true })
  process.exit(code)
}

process.on("SIGINT", () => void shutdown(0))
process.on("SIGTERM", () => void shutdown(0))

try {
  fs.rmSync(quitFlag, { force: true })
  const port = Number.isFinite(webPort) ? webPort : 40091
  if (await isWebReady()) {
    console.log(`[dev] web already ready: http://127.0.0.1:${port}`)
  } else {
    console.log(`[dev] start web: http://127.0.0.1:${port}`)
    const web = start("web", ["--prefix", "web", "run", "dev"])
    startedWeb = true
    await waitForWeb(web)
  }

  console.log("[dev] start desktop shell")
  const desktop = start("desktop", ["--prefix", "desktop", "run", "dev"])
  desktop.on("exit", () => void shutdown(0))
} catch (error) {
  process.stderr.write(`[dev] ${error instanceof Error ? error.message : String(error)}\n`)
  await shutdown(1)
}
