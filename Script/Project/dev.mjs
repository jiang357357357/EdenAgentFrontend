import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnExecutable, spawnNpm } from "./process_runner.mjs"
import monconfig from "../../desktop/src/app/monconfig.cjs"

const { parseMonConfigValue } = monconfig

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, "../..")
const agentRoot = path.resolve(frontendRoot, "..")
const configPath = path.join(agentRoot, ".monconfig")
const smokeWebOnly = process.argv.includes("--smoke-web")

const webPort = Number(process.env.MON_AGENT_WEB_PORT ?? readMonConfigValue("server", "WEB_PORT", "40091"))
const quitFlag = resolveAgentPath(readMonConfigValue("desktop", "QUIT_FLAG", ".artifacts/desktop-quit.flag"))
const children = []
let shuttingDown = false

function handleOutputError(error) {
  if (error?.code === "EPIPE" || error?.code === "ERR_STREAM_DESTROYED") {
    void shutdown(0)
    return
  }
  setImmediate(() => { throw error })
}

process.stdout.on("error", handleOutputError)
process.stderr.on("error", handleOutputError)

function readMonConfigValue(targetSection, targetKey, fallback) {
  let contents
  try {
    contents = fs.readFileSync(configPath, "utf8")
  } catch {
    return fallback
  }
  const value = parseMonConfigValue(contents, targetSection, targetKey)
  return value || fallback
}

function resolveAgentPath(value) {
  return path.isAbsolute(value) ? value : path.join(agentRoot, value)
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

function childEnv(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === null) delete env[key]
  }
  return env
}

function start(label, args, extraEnv = {}) {
  const child = spawnNpm(args, {
    cwd: frontendRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv(extraEnv),
    detached: process.platform !== "win32",
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
  child.on("error", (error) => {
    if (!shuttingDown) {
      process.stderr.write(`[dev] unable to start ${label}: ${error.message}\n`)
      void shutdown(1)
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
    const child = spawnExecutable(args[0], args.slice(1), { cwd: frontendRoot, stdio: "ignore" })
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

function runCapture(args, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const child = spawnExecutable(args[0], args.slice(1), {
      cwd: frontendRoot,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    child.stdout?.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr?.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("exit", (exitCode) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode })
    })
    child.on("error", () => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: 1 })
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

async function killPidTree(pid) {
  if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) return
  if (process.platform === "win32") {
    await runWithTimeout(["taskkill", "/PID", String(pid), "/T", "/F"], 3000)
    return
  }
  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    try {
      process.kill(pid, "SIGTERM")
    } catch {}
  }
}

async function portPids(port) {
  const pids = new Set()
  const addPid = (value) => {
    const text = String(value ?? "").trim()
    if (!/^[1-9]\d*$/.test(text)) return
    pids.add(Number(text))
  }
  if (process.platform === "win32") {
    const result = await runCapture(["netstat", "-ano"], 5000).catch(() => ({ stdout: "", stderr: "", exitCode: 1 }))
    const pattern = new RegExp(`(?:0\\.0\\.0\\.0|127\\.0\\.0\\.1|\\[?::\\]?):${port}\\s+.*\\s+LISTENING\\s+(\\d+)`, "i")
    for (const line of result.stdout.split(/\r?\n/)) {
      const match = line.match(pattern)
      addPid(match?.[1])
    }
    return [...pids]
  }

  const lsof = await runCapture(["lsof", `-tiTCP:${port}`, "-sTCP:LISTEN", "-P", "-n"], 5000).catch(() => ({
    stdout: "",
    stderr: "",
    exitCode: 1,
  }))
  for (const line of lsof.stdout.split(/\r?\n/)) {
    addPid(line)
  }
  if (pids.size) return [...pids]

  const ss = await runCapture(["ss", "-ltnp", `( sport = :${port} )`], 5000).catch(() => ({
    stdout: "",
    stderr: "",
    exitCode: 1,
  }))
  for (const match of ss.stdout.matchAll(/pid=(\d+)/g)) {
    addPid(match[1])
  }
  if (pids.size) return [...pids]

  const fuser = await runCapture(["fuser", `${port}/tcp`], 5000).catch(() => ({
    stdout: "",
    stderr: "",
    exitCode: 1,
  }))
  for (const token of `${fuser.stdout}\n${fuser.stderr}`.split(/\s+/)) {
    addPid(token)
  }
  return [...pids]
}

async function processCommandLine(pid) {
  if (process.platform === "win32") {
    const script = `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object -ExpandProperty CommandLine`
    const result = await runCapture(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], 5000).catch(() => ({
      stdout: "",
      stderr: "",
      exitCode: 1,
    }))
    return result.stdout.trim()
  }

  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim()
  } catch {
    const result = await runCapture(["ps", "-p", String(pid), "-o", "command="], 3000).catch(() => ({
      stdout: "",
      stderr: "",
      exitCode: 1,
    }))
    return result.stdout.trim()
  }
}

async function releaseTcpPort(port, label) {
  const pids = await portPids(port)
  if (!pids.length) return

  console.log(`[dev] port ${port} is occupied; releasing before starting ${label}`)
  for (const pid of pids) {
    const commandLine = await processCommandLine(pid)
    console.log(`    - PID ${pid}${commandLine ? `: ${commandLine}` : ""}`)
    await killPidTree(pid)
  }

  for (let index = 0; index < 20; index += 1) {
    if (!(await portPids(port)).length) return
    await sleep(250)
  }

  throw new Error(`port ${port} is still occupied after cleanup`)
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
    await killProcessTree(child)
  }
  fs.rmSync(quitFlag, { force: true })
  process.exit(code)
}

process.on("SIGINT", () => void shutdown(0))
process.on("SIGTERM", () => void shutdown(0))
if (process.platform !== "win32") process.on("SIGHUP", () => void shutdown(0))

try {
  fs.rmSync(quitFlag, { force: true })
  const port = Number.isFinite(webPort) ? webPort : 40091
  await releaseTcpPort(port, "web")
  console.log(`[dev] start web: http://127.0.0.1:${port}`)
  const web = start("web", ["--prefix", "web", "run", "dev"])
  await waitForWeb(web)
  if (smokeWebOnly) {
    console.log("[dev] web startup smoke check passed")
    await shutdown(0)
  }

  console.log("[dev] start desktop shell")
  const desktop = start("desktop", ["--prefix", "desktop", "run", "dev"], {
    ELECTRON_RUN_AS_NODE: undefined,
    MON_AGENT_DEV_PARENT_PID: String(process.pid),
  })
  desktop.on("exit", () => void shutdown(0))
} catch (error) {
  process.stderr.write(`[dev] ${error instanceof Error ? error.message : String(error)}\n`)
  await shutdown(1)
}
