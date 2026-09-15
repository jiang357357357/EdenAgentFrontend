const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4))

function sleepSync(milliseconds) {
  Atomics.wait(sleepBuffer, 0, 0, milliseconds)
}

function capture(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 })
  } catch (error) {
    return typeof error?.stdout === "string" ? error.stdout : ""
  }
}

function positivePid(value) {
  const text = String(value ?? "").trim()
  return /^[1-9]\d*$/.test(text) ? Number(text) : null
}

function listenerPids(port, platform = process.platform) {
  const result = new Set()
  if (platform === "win32") {
    const pattern = new RegExp(`(?:^|\\s)(?:TCP\\s+)?(?:0\\.0\\.0\\.0|127\\.0\\.0\\.1|\\[?::\\]?):${port}\\s+.*?\\s+LISTENING\\s+(\\d+)\\s*$`, "i")
    for (const line of capture("netstat", ["-ano"]).split(/\r?\n/)) {
      const pid = positivePid(line.match(pattern)?.[1])
      if (pid) result.add(pid)
    }
    return [...result]
  }

  for (const line of capture("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN", "-P", "-n"]).split(/\r?\n/)) {
    const pid = positivePid(line)
    if (pid) result.add(pid)
  }
  if (!result.size) {
    for (const match of capture("ss", ["-ltnp", `( sport = :${port} )`]).matchAll(/pid=(\d+)/g)) {
      const pid = positivePid(match[1])
      if (pid) result.add(pid)
    }
  }
  if (!result.size) {
    for (const token of capture("fuser", [`${port}/tcp`]).split(/\s+/)) {
      const pid = positivePid(token)
      if (pid) result.add(pid)
    }
  }
  return [...result]
}

function linuxProcessInfo(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8")
    const parentPid = positivePid(status.match(/^PPid:\s+(\d+)/m)?.[1]) ?? 0
    const commandLine = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean)
    return { parentPid, commandLine }
  } catch {
    return null
  }
}

function protectedPids(platform = process.platform) {
  const result = new Set([process.pid])
  if (platform === "win32") return result
  let pid = process.ppid
  while (pid > 1 && !result.has(pid)) {
    result.add(pid)
    pid = linuxProcessInfo(pid)?.parentPid ?? 0
  }
  return result
}

function stopMonPmOwner(pid) {
  if (process.platform === "win32") return false
  let ancestorPid = pid
  for (let depth = 0; depth < 12 && ancestorPid > 1; depth += 1) {
    const info = linuxProcessInfo(ancestorPid)
    if (!info) break
    const daemonIndex = info.commandLine.indexOf("daemon")
    const configIndex = info.commandLine.indexOf("-config")
    const executable = info.commandLine[0]
    if (daemonIndex >= 0 && configIndex >= 0 && info.commandLine[configIndex + 1] && /(?:^|\/)monpm$/.test(executable)) {
      const configPath = path.resolve(info.commandLine[configIndex + 1])
      const statePath = path.join(path.dirname(configPath), "state.json")
      try {
        const state = JSON.parse(fs.readFileSync(statePath, "utf8"))
        const entry = Object.entries(state.apps ?? {}).find(([, value]) => value?.pid === pid || value?.process_group_id === pid)
        if (!entry) return false
        execFileSync(executable, ["stop", entry[0], "-config", configPath], { stdio: "ignore", timeout: 15000 })
        return true
      } catch {
        return false
      }
    }
    ancestorPid = info.parentPid
  }
  return false
}

function terminatePid(pid, signal, platform = process.platform) {
  if (platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 5000 })
    } catch {}
    return
  }
  try {
    process.kill(pid, signal)
  } catch (error) {
    if (error?.code !== "ESRCH") throw error
  }
}

function takeOverTcpPort(port, label = "service", { log = console.log } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError(`Invalid TCP port: ${port}`)
  const protectedSet = protectedPids()
  let owners = listenerPids(port)
  if (!owners.length) return []
  log(`[startup] 接管 ${label} 端口 ${port}，停止现有监听进程：${owners.join(", ")}`)

  const taken = new Set()
  for (const pid of owners) {
    if (protectedSet.has(pid)) throw new Error(`Refusing to terminate the current launcher process chain (pid ${pid})`)
    stopMonPmOwner(pid)
    terminatePid(pid, "SIGTERM")
    taken.add(pid)
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    owners = listenerPids(port).filter(pid => !protectedSet.has(pid))
    if (!owners.length) return [...taken]
    if (attempt === 14) for (const pid of owners) terminatePid(pid, "SIGKILL")
    sleepSync(100)
  }
  throw new Error(`${label} port ${port} is still occupied after takeover`)
}

module.exports = { listenerPids, takeOverTcpPort }
