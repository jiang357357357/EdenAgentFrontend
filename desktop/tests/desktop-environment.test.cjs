const assert = require("node:assert/strict")
const test = require("node:test")

const {
  createDesktopEnvironmentService,
  panelForDisplay,
  parseGSettingsArray,
  parseGSettingsString,
  parseRegistryValue,
  readWindowsDesktopEnvironment,
  resolveWindowsWallpaperPath,
  wallpaperPathFromUri,
  windowsBackgroundColor,
  windowsWallpaperMode,
} = require("../src/app/desktop-environment.cjs")

test("parses gsettings strings and arrays", () => {
  assert.equal(parseGSettingsString("'hello\\'s world'"), "hello's world")
  assert.deepEqual(parseGSettingsArray("['1:0:top', '2:1:bottom']"), ["1:0:top", "2:1:bottom"])
  assert.equal(wallpaperPathFromUri("file:///tmp/wallpaper.png", () => "/tmp/wallpaper.png"), "/tmp/wallpaper.png")
})

test("maps Cinnamon panels to their display", () => {
  const panel = panelForDisplay(
    { id: 20 },
    [{ id: 10 }, { id: 20 }],
    ["3:1:top"],
    ["3:48"],
    ["3:always"],
    ["panel3:left:0:menu", "panel2:right:0:clock"],
  )
  assert.deepEqual(panel, {
    id: 3,
    position: "top",
    height: 48,
    autoHide: true,
    applets: ["panel3:left:0:menu"],
  })
})

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

test("reads a Cinnamon desktop preview", async () => {
  const values = new Map([
    ["org.cinnamon.desktop.background:picture-uri", "'file:///tmp/wall.jpg'"],
    ["org.cinnamon.desktop.background:picture-options", "'zoom'"],
    ["org.cinnamon.desktop.background:primary-color", "'#123456'"],
    ["org.cinnamon:panels-enabled", "['7:0:bottom']"],
    ["org.cinnamon:panels-height", "['7:42']"],
    ["org.cinnamon:panels-autohide", "['7:false']"],
    ["org.cinnamon:enabled-applets", "['panel7:left:0:menu']"],
  ])
  const display = {
    id: 10,
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  }
  const service = createDesktopEnvironmentService({
    platform: "linux",
    environment: { XDG_CURRENT_DESKTOP: "X-Cinnamon" },
    screen: { getAllDisplays: () => [display] },
    execFileAsync: async (_file, args) => ({ stdout: values.get(`${args[1]}:${args[2]}`) ?? "" }),
  })

  const result = await service.read(display)
  assert.equal(result.desktop, "cinnamon")
  assert.equal(result.wallpaper.filePath, "/tmp/wall.jpg")
  assert.deepEqual(result.panel, {
    id: 7,
    position: "bottom",
    height: 42,
    autoHide: false,
    applets: ["panel7:left:0:menu"],
  })
})

test("desktop environment monitors start once and are stopped together", () => {
  const spawned = []
  const changed = []
  const service = createDesktopEnvironmentService({
    platform: "linux",
    environment: { XDG_CURRENT_DESKTOP: "cinnamon" },
    screen: { getAllDisplays: () => [] },
    execFileAsync: async () => ({ stdout: "" }),
    onChanged: (value) => changed.push(value),
    spawnProcess(file, args, options) {
      const handlers = new Map()
      const stdoutHandlers = new Map()
      const monitor = {
        killed: false,
        stdout: { on: (event, handler) => stdoutHandlers.set(event, handler) },
        on: (event, handler) => handlers.set(event, handler),
        kill() { this.killed = true },
        handlers,
        stdoutHandlers,
      }
      spawned.push({ file, args, options, monitor })
      return monitor
    },
  })

  assert.equal(service.startMonitors(), true)
  assert.equal(service.startMonitors(), false)
  assert.equal(spawned.length, 2)
  spawned[0].monitor.stdoutHandlers.get("data")("changed")
  assert.deepEqual(changed, ["changed"])
  service.stopMonitors()
  assert.equal(spawned.every(({ monitor }) => monitor.killed), true)
})
