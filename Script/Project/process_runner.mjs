import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

function assertArguments(args) {
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) {
    throw new TypeError("Process arguments must be an array of strings")
  }
}

function isJavaScriptCli(filePath) {
  return /\.(?:cjs|mjs|js)$/i.test(filePath)
}

export function resolveNpmInvocation(args, runtime = {}) {
  assertArguments(args)
  const environment = runtime.environment ?? process.env
  const execPath = runtime.execPath ?? process.execPath
  const platform = runtime.platform ?? process.platform
  const fileExists = runtime.fileExists ?? existsSync
  const pathApi = platform === "win32" ? path.win32 : path
  const inheritedCli = String(environment.npm_execpath ?? "").trim()

  if (inheritedCli && isJavaScriptCli(inheritedCli) && fileExists(inheritedCli)) {
    return {
      command: execPath,
      args: [inheritedCli, ...args],
      npmCli: inheritedCli,
    }
  }

  const bundledCli = pathApi.join(pathApi.dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js")
  if (fileExists(bundledCli)) {
    return {
      command: execPath,
      args: [bundledCli, ...args],
      npmCli: bundledCli,
    }
  }

  if (platform !== "win32") {
    return {
      command: "npm",
      args,
      npmCli: null,
    }
  }

  throw new Error(
    "Unable to locate npm-cli.js. Start this command through npm run, or repair the Node.js/npm installation.",
  )
}

export function spawnExecutable(command, args, options = {}) {
  if (typeof command !== "string" || !command.trim()) {
    throw new TypeError("Process command must be a non-empty string")
  }
  assertArguments(args)
  const { shell: _ignoredShell, ...safeOptions } = options

  try {
    return spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...safeOptions,
      shell: false,
    })
  } catch (error) {
    throw new Error(
      `Unable to spawn ${command}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

export function spawnNpm(args, options = {}) {
  const invocation = resolveNpmInvocation(args, {
    environment: options.env ?? process.env,
  })
  return spawnExecutable(invocation.command, invocation.args, options)
}
