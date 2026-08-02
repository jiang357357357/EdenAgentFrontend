const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

if (process.platform !== "win32") {
  console.log("[native] Win32 no-activate addon is not needed on this platform")
  process.exit(0)
}

const desktopRoot = path.resolve(__dirname, "..")
const agentRoot = path.resolve(desktopRoot, "..", "..")
const nativeRoot = path.join(desktopRoot, "native", "win32-noactivate")
const outputPath = path.join(nativeRoot, "build", "Release", "monagent_noactivate.node")
const inputs = [path.join(nativeRoot, "binding.gyp"), path.join(nativeRoot, "noactivate.cc")]

const outputMtime = fs.existsSync(outputPath) ? fs.statSync(outputPath).mtimeMs : 0
const newestInputMtime = Math.max(...inputs.map((input) => fs.statSync(input).mtimeMs))
if (outputMtime >= newestInputMtime) {
  console.log("[native] Win32 no-activate addon is up to date")
  process.exit(0)
}

let nodeGypEntry
try {
  nodeGypEntry = require.resolve("node-gyp/bin/node-gyp.js")
} catch {
  throw new Error("node-gyp is required to build the Win32 no-activate addon; run npm install first")
}

console.log("[native] building Win32 no-activate addon")
function resolvePythonExecutable() {
  const configured = process.env.npm_config_python || process.env.PYTHON
  if (configured && fs.existsSync(configured)) return configured

  const serverPython = path.join(agentRoot, "Server", ".venv", "Scripts", "python.exe")
  if (fs.existsSync(serverPython)) return serverPython

  const uvResult = spawnSync("uv", ["python", "find"], { encoding: "utf8", shell: true })
  const uvPython = uvResult.status === 0 ? uvResult.stdout.trim() : ""
  return uvPython && fs.existsSync(uvPython) ? uvPython : undefined
}

const pythonExecutable = resolvePythonExecutable()
const result = spawnSync(process.execPath, [nodeGypEntry, "rebuild"], {
  cwd: nativeRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    npm_config_arch: process.arch,
    ...(pythonExecutable ? { npm_config_python: pythonExecutable, PYTHON: pythonExecutable } : {}),
  },
})
if (result.error) throw result.error
if (result.status !== 0 || !fs.existsSync(outputPath)) {
  throw new Error(`Win32 no-activate addon build failed with exit code ${result.status}`)
}
