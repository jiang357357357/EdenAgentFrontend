import { build } from "esbuild"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const webRoot = fileURLToPath(new URL("../", import.meta.url))
const frontendRoot = resolve(webRoot, "..")

export async function measureStreamingPerformance(baselinePath) {
  const electronPath = createRequire(new URL("../../desktop/package.json", import.meta.url))("electron")
  const temporaryRoot = resolve(tmpdir())
  const scratch = await mkdtemp(join(temporaryRoot, "eden-streaming-renderer-"))
  try {
    const sources = baselinePath ? JSON.parse(await readFile(baselinePath, "utf8")) : {}
    const plugins = [{ name: "before-sources", setup(builder) {
      builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, args => {
        const contents = sources[args.path.replaceAll("\\", "/")]
        return contents === undefined ? undefined : { contents,
          loader: args.path.endsWith("tsx") ? "tsx" : "ts", resolveDir: dirname(args.path) }
      })
    } }]
    await build({ absWorkingDir: webRoot, entryPoints: ["tests/fixtures/streaming-renderer.tsx"],
      outfile: join(scratch, "renderer.js"), bundle: true, format: "iife", platform: "browser",
      jsx: "automatic", plugins, define: { "process.env.NODE_ENV": '"development"', "import.meta": "{}" },
      logOverride: { "import-is-undefined": "silent" } })
    await writeFile(join(scratch, "index.html"), '<!doctype html><meta charset="utf-8"><script src="renderer.js"></script>')
    await writeFile(join(scratch, "main.cjs"), `
const { app, BrowserWindow } = require("electron");
app.setPath("userData", ${JSON.stringify(join(scratch, "user-data"))});
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1000, height: 800,
    webPreferences: { backgroundThrottling: false } });
  try {
    await window.loadFile(${JSON.stringify(join(scratch, "index.html"))});
    const result = await window.webContents.executeJavaScript("window.runStreamingBenchmark()");
    process.stdout.write("EDEN_PERF_RESULT=" + JSON.stringify(result) + "\\n");
  } catch (error) { process.stderr.write(String(error.stack || error) + "\\n"); process.exitCode = 1; }
  finally { window.destroy(); app.quit(); }
});`)
    return await new Promise((fulfill, reject) => {
      const environment = { ...process.env }
      delete environment.ELECTRON_RUN_AS_NODE
      delete environment.NODE_OPTIONS
      const child = spawn(electronPath, [join(scratch, "main.cjs")], { windowsHide: true,
        env: environment, stdio: ["ignore", "pipe", "pipe"] })
      let stdout = "", stderr = ""
      const timeout = setTimeout(() => { child.kill(); reject(new Error("isolated renderer timed out")) }, 60_000)
      child.stdout.on("data", chunk => { stdout += chunk })
      child.stderr.on("data", chunk => { stderr += chunk })
      child.on("error", error => { clearTimeout(timeout); reject(error) })
      child.on("exit", code => {
        clearTimeout(timeout)
        const line = stdout.split(/\r?\n/).find(line => line.startsWith("EDEN_PERF_RESULT="))
        if (code !== 0 || !line) reject(new Error(`renderer failed (${code}): ${stderr.slice(-4000)}`))
        else fulfill(JSON.parse(line.slice("EDEN_PERF_RESULT=".length)))
      })
    })
  } finally {
    if (dirname(resolve(scratch)) !== temporaryRoot) throw new Error("unexpected renderer temp directory")
    // scratch is a newly created temp directory owned exclusively by this run.
    await rm(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const baseline = process.argv.indexOf("--baseline")
  const output = process.argv.indexOf("--output")
  const result = await measureStreamingPerformance(baseline >= 0 ? process.argv[baseline + 1] : undefined)
  if (output >= 0) await writeFile(process.argv[output + 1], JSON.stringify(result, null, 2) + "\n")
  console.log(JSON.stringify(result))
}
