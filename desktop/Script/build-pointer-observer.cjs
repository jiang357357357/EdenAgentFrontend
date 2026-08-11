const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

if (process.platform !== "win32") {
  console.log("[pointer-observer] skipped: Windows-only helper")
  process.exit(0)
}

const crateRoot = path.resolve(__dirname, "..", "native", "win32-pointer-observer")
const manifestPath = path.join(crateRoot, "Cargo.toml")
const sourcePath = path.join(crateRoot, "target", "release", "monagent-pointer-observer.exe")
const outputDir = path.join(crateRoot, "bin")
const outputPath = path.join(outputDir, "monagent-pointer-observer.exe")

console.log("[pointer-observer] building Windows global pointer observer")
execFileSync("cargo", ["build", "--release", "--locked", "--manifest-path", manifestPath], {
  cwd: crateRoot,
  stdio: "inherit",
  windowsHide: true,
})
fs.mkdirSync(outputDir, { recursive: true })
fs.copyFileSync(sourcePath, outputPath)
console.log(`[pointer-observer] ready: ${outputPath}`)
