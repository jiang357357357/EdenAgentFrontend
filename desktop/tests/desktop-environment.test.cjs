const assert = require("node:assert/strict")
const test = require("node:test")

const {
  parseRegistryValue,
  readWindowsDesktopEnvironment,
  resolveWindowsWallpaperPath,
  windowsBackgroundColor,
  windowsWallpaperMode,
} = require("../src/desktop-environment.cjs")

test("parses Windows registry values without depending on localized headings", () => {
  const output = Buffer.from("\r\nHKEY_CURRENT_USER\\Control Panel\\Desktop\r\n    WallPaper    REG_SZ    C:\\Pictures\\wall.jpg\r\n")
  assert.equal(parseRegistryValue(output, "WallPaper"), "C:\\Pictures\\wall.jpg")
})

test("maps Windows wallpaper layout values to preview modes", () => {
  assert.equal(windowsWallpaperMode("0", "0"), "centered")
  assert.equal(windowsWallpaperMode("2", "0"), "stretched")
  assert.equal(windowsWallpaperMode("6", "0"), "scaled")
  assert.equal(windowsWallpaperMode("10", "0"), "zoom")
  assert.equal(windowsWallpaperMode("22", "0"), "zoom")
  assert.equal(windowsWallpaperMode("10", "1"), "wallpaper")
})

test("converts the Windows desktop background color to CSS", () => {
  assert.equal(windowsBackgroundColor("12 34 56"), "#0c2238")
  assert.equal(windowsBackgroundColor("invalid"), "#000000")
})

test("falls back to TranscodedWallpaper when the registry path is unavailable", () => {
  const existing = new Set(["C:\\Users\\tester\\AppData\\Roaming\\Microsoft\\Windows\\Themes\\TranscodedWallpaper"])
  const fileSystem = {
    existsSync: (filePath) => existing.has(filePath),
    readdirSync: () => [],
    statSync: () => ({ isFile: () => true, mtimeMs: 0 }),
  }
  assert.equal(
    resolveWindowsWallpaperPath("C:\\missing.jpg", "C:\\Users\\tester\\AppData\\Roaming", fileSystem),
    "C:\\Users\\tester\\AppData\\Roaming\\Microsoft\\Windows\\Themes\\TranscodedWallpaper",
  )
})

test("reads a complete Windows desktop preview", async () => {
  const values = {
    WallPaper: "C:\\Pictures\\wall.jpg",
    WallpaperStyle: "10",
    TileWallpaper: "0",
    Background: "1 2 3",
  }
  const execFileAsync = async (_file, args) => ({
    stdout: Buffer.from(`    ${args[3]}    REG_SZ    ${values[args[3]]}\r\n`),
  })
  const environment = await readWindowsDesktopEnvironment(
    {
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    },
    {
      execFileAsync,
      env: { APPDATA: "C:\\Users\\tester\\AppData\\Roaming" },
      fs: {
        existsSync: (filePath) => filePath === "C:\\Pictures\\wall.jpg",
        readdirSync: () => [],
        statSync: () => ({ isFile: () => true, mtimeMs: 0 }),
      },
    },
  )

  assert.deepEqual(environment, {
    desktop: "windows",
    wallpaper: {
      filePath: "C:\\Pictures\\wall.jpg",
      mode: "zoom",
      primaryColor: "#010203",
    },
    panel: null,
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  })
})
