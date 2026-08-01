const { spawnSync } = require("node:child_process")
const path = require("node:path")

const electronExecutable = require("electron")
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const result = spawnSync(
  electronExecutable,
  [path.join(__dirname, "test-native-noactivate-electron.cjs")],
  { stdio: "inherit", env },
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
