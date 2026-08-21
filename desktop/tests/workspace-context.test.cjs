const assert = require("node:assert/strict")
const path = require("node:path")
const test = require("node:test")

const { createWorkspaceContext, parseMonConfigValue } = require("../src/app/workspace-context.cjs")

test("parses sectioned Mon configuration values case-insensitively", () => {
  const contents = "# comment\n[server]\nHost = 0.0.0.0\nPORT=40011 ; comment\nURL=https://example.test/#fragment # comment\n"
  assert.equal(parseMonConfigValue(contents, "SERVER", "host"), "0.0.0.0")
  assert.equal(parseMonConfigValue(contents, "server", "port"), "40011")
  assert.equal(parseMonConfigValue(contents, "server", "url"), "https://example.test/#fragment")
  assert.equal(parseMonConfigValue(contents, "server", "missing"), undefined)
})

test("rejects malformed Mon configuration", () => {
  assert.throws(() => parseMonConfigValue("[server]\nBROKEN\n", "server", "PORT"), /expected KEY=VALUE/)
})

function createContext(files, env = {}) {
  const existing = new Set(Object.keys(files))
  return createWorkspaceContext({
    app: { isPackaged: false },
    moduleDir: "D:\\Mon\\Agent\\frontend\\desktop\\src",
    processObject: {
      env: { MON_AGENT_ROOT: "D:\\Mon\\Agent", ...env },
      platform: "win32",
      execPath: "D:\\Mon\\Agent\\frontend\\electron.exe",
      resourcesPath: "D:\\resources",
      cwd: () => "D:\\Mon",
    },
    fileSystem: {
      existsSync: (filePath) => existing.has(filePath),
      readFileSync: (filePath) => {
        if (!existing.has(filePath)) throw new Error("missing")
        return files[filePath]
      },
    },
    pathApi: path.win32,
  })
}

test("resolves frontend, agent configuration and desktop icons", () => {
  const context = createContext({
    "D:\\Mon\\Agent\\.monconfig": "[auth_dev]\nUSERNAME=dev\nPASSWORD=secret\n[desktop]\nPET_SETTINGS=.state/pet.json",
    "D:\\Mon\\Agent\\frontend\\desktop\\assets\\icon.ico": "icon",
  })

  assert.equal(context.frontendRoot, "D:\\Mon\\Agent\\frontend")
  assert.equal(context.agentRoot, "D:\\Mon\\Agent")
  assert.deepEqual(context.getDevAccount(), { username: "dev", password: "secret" })
  assert.equal(context.resolveMonConfigPath("desktop", "PET_SETTINGS", "fallback"), "D:\\Mon\\Agent\\.state\\pet.json")
  assert.equal(context.resolveDesktopIconPath(), "D:\\Mon\\Agent\\frontend\\desktop\\assets\\icon.ico")
})

test("resolves the MonCore URL from the workspace and normalizes wildcard hosts", () => {
  const context = createContext({
    "D:\\Mon\\.monconfig": "[workspace]\nNAME=Mon",
    "D:\\Mon\\.monworkspace": "{}",
    "D:\\Mon\\Agent\\.monconfig": "SERVICE_ID=monagent",
    "D:\\Mon\\Core\\.monconfig": "[server]\nHOST=0.0.0.0\nPORT=40111",
  })
  assert.equal(context.resolveCoreBaseUrl(), "http://127.0.0.1:40111")
})

test("an explicit Core URL wins and loses its trailing slash", () => {
  const context = createContext({}, { MONCORE_CORE_BASE_URL: "https://core.example.test/" })
  assert.equal(context.resolveCoreBaseUrl(), "https://core.example.test")
})
