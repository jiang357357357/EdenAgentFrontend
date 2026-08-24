const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")
const { fileURLToPath } = require("node:url")

const WINDOWS_DESKTOP_KEY = "HKCU\\Control Panel\\Desktop"
const WINDOWS_COLORS_KEY = "HKCU\\Control Panel\\Colors"

function decodeProcessOutput(value) {
  if (typeof value === "string") return value
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value ?? "")
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("gb18030").decode(bytes)
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseRegistryValue(output, valueName) {
  const pattern = new RegExp(`^\\s*${escapeRegExp(valueName)}\\s+REG_[A-Z0-9_]+\\s+(.*)$`, "im")
  return pattern.exec(decodeProcessOutput(output))?.[1]?.trim() ?? ""
}

async function readRegistryValue(execFileAsync, key, valueName) {
  try {
    const result = await execFileAsync("reg.exe", ["query", key, "/v", valueName], {
      encoding: "buffer",
      maxBuffer: 1024 * 1024,
      timeout: 1500,
      windowsHide: true,
    })
    return parseRegistryValue(result.stdout, valueName)
  } catch {
    return ""
  }
}

function windowsWallpaperMode(wallpaperStyle, tileWallpaper) {
  if (String(tileWallpaper).trim() === "1") return "wallpaper"
  switch (String(wallpaperStyle).trim()) {
    case "0":
      return "centered"
    case "2":
      return "stretched"
    case "6":
      return "scaled"
    case "10":
    case "22":
      return "zoom"
    default:
      return "zoom"
  }
}

function windowsBackgroundColor(value) {
  const channels = String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((channel) => Math.max(0, Math.min(255, Number(channel))))
  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) return "#000000"
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`
}

function cachedWallpaperPaths(appData, fileSystem) {
  if (!appData) return []
  const cacheDir = path.win32.join(appData, "Microsoft", "Windows", "Themes", "CachedFiles")
  try {
    return fileSystem
      .readdirSync(cacheDir)
      .map((name) => path.win32.join(cacheDir, name))
      .filter((filePath) => fileSystem.statSync(filePath).isFile())
      .sort((left, right) => fileSystem.statSync(right).mtimeMs - fileSystem.statSync(left).mtimeMs)
  } catch {
    return []
  }
}

function resolveWindowsWallpaperPath(registryPath, appData, fileSystem = fs) {
  const candidates = [registryPath]
  if (appData) {
    candidates.push(path.win32.join(appData, "Microsoft", "Windows", "Themes", "TranscodedWallpaper"))
    candidates.push(...cachedWallpaperPaths(appData, fileSystem))
  }
  return candidates.find((candidate) => candidate && fileSystem.existsSync(candidate)) ?? ""
}

async function readWindowsDesktopEnvironment(display, options) {
  const execFileAsync = options.execFileAsync
  const environment = options.env ?? process.env
  const fileSystem = options.fs ?? fs
  const [registryPath, wallpaperStyle, tileWallpaper, backgroundColor] = await Promise.all([
    readRegistryValue(execFileAsync, WINDOWS_DESKTOP_KEY, "WallPaper"),
    readRegistryValue(execFileAsync, WINDOWS_DESKTOP_KEY, "WallpaperStyle"),
    readRegistryValue(execFileAsync, WINDOWS_DESKTOP_KEY, "TileWallpaper"),
    readRegistryValue(execFileAsync, WINDOWS_COLORS_KEY, "Background"),
  ])

  return {
    desktop: "windows",
    wallpaper: {
      filePath: resolveWindowsWallpaperPath(registryPath, environment.APPDATA, fileSystem),
      mode: windowsWallpaperMode(wallpaperStyle, tileWallpaper),
      primaryColor: windowsBackgroundColor(backgroundColor),
    },
    panel: null,
    workArea: { ...display.workArea },
    displayBounds: { ...display.bounds },
  }
}

function parseGSettingsString(value) {
  const trimmed = String(value ?? "").trim()
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\")
  }
  return trimmed
}

function parseGSettingsArray(value) {
  const items = []
  const pattern = /'((?:\\.|[^'])*)'/g
  let match
  while ((match = pattern.exec(String(value ?? "")))) {
    items.push(match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\"))
  }
  return items
}

function wallpaperPathFromUri(uri, fileUrlToPath = fileURLToPath) {
  if (!uri) return ""
  if (!uri.startsWith("file://")) return uri
  try {
    return fileUrlToPath(uri)
  } catch {
    return decodeURIComponent(uri.replace(/^file:\/\//, ""))
  }
}

function panelForDisplay(display, allDisplays, enabled, heights, autoHide, applets) {
  const displayIndex = Math.max(0, allDisplays.findIndex((item) => item.id === display.id))
  const panelRecord = enabled
    .map((item) => item.split(":"))
    .find((parts) => Number(parts[1]) === displayIndex)
  if (!panelRecord) return null
  const panelId = Number(panelRecord[0])
  const heightRecord = heights.map((item) => item.split(":")).find((parts) => Number(parts[0]) === panelId)
  const autoHideRecord = autoHide.map((item) => item.split(":")).find((parts) => Number(parts[0]) === panelId)
  return {
    id: panelId,
    position: ["top", "bottom", "left", "right"].includes(panelRecord[2]) ? panelRecord[2] : "bottom",
    height: Math.max(20, Number(heightRecord?.[1]) || 40),
    autoHide: autoHideRecord?.[1] === "true" || autoHideRecord?.[1] === "always",
    applets: applets.filter((item) => item.startsWith(`panel${panelId}:`)),
  }
}

function createDesktopEnvironmentService({
  platform = process.platform,
  environment = process.env,
  screen,
  execFileAsync,
  spawnProcess = spawn,
  onChanged = () => {},
} = {}) {
  const monitors = []

  async function readGSettings(schema, key) {
    const result = await execFileAsync("gsettings", ["get", schema, key], {
      encoding: "utf8",
      timeout: 1500,
    })
    return String(result.stdout ?? "").trim()
  }

  async function read(display) {
    if (platform === "win32") {
      return readWindowsDesktopEnvironment(display, { execFileAsync, env: environment })
    }
    const desktopName = String(environment.XDG_CURRENT_DESKTOP || environment.DESKTOP_SESSION || "").toLowerCase()
    const cinnamon = desktopName.includes("cinnamon")
    const wallpaperSchema = cinnamon ? "org.cinnamon.desktop.background" : "org.gnome.desktop.background"
    const [pictureUriValue, pictureOptionsValue, primaryColorValue] = await Promise.all([
      readGSettings(wallpaperSchema, "picture-uri").catch(() => ""),
      readGSettings(wallpaperSchema, "picture-options").catch(() => "'zoom'"),
      readGSettings(wallpaperSchema, "primary-color").catch(() => "'#000000'"),
    ])
    let panel = null
    if (cinnamon) {
      const [enabledValue, heightsValue, autoHideValue, appletsValue] = await Promise.all([
        readGSettings("org.cinnamon", "panels-enabled").catch(() => "[]"),
        readGSettings("org.cinnamon", "panels-height").catch(() => "[]"),
        readGSettings("org.cinnamon", "panels-autohide").catch(() => "[]"),
        readGSettings("org.cinnamon", "enabled-applets").catch(() => "[]"),
      ])
      panel = panelForDisplay(
        display,
        screen.getAllDisplays(),
        parseGSettingsArray(enabledValue),
        parseGSettingsArray(heightsValue),
        parseGSettingsArray(autoHideValue),
        parseGSettingsArray(appletsValue),
      )
    }
    const pictureUri = parseGSettingsString(pictureUriValue)
    return {
      desktop: cinnamon ? "cinnamon" : desktopName || "linux",
      wallpaper: {
        filePath: wallpaperPathFromUri(pictureUri),
        mode: parseGSettingsString(pictureOptionsValue) || "zoom",
        primaryColor: parseGSettingsString(primaryColorValue) || "#000000",
      },
      panel,
      workArea: { ...display.workArea },
      displayBounds: { ...display.bounds },
    }
  }

  function startMonitors() {
    if (platform !== "linux" || monitors.length > 0) return false
    const desktopName = String(environment.XDG_CURRENT_DESKTOP || environment.DESKTOP_SESSION || "").toLowerCase()
    const schemas = desktopName.includes("cinnamon")
      ? ["org.cinnamon.desktop.background", "org.cinnamon"]
      : ["org.gnome.desktop.background"]
    for (const schema of schemas) {
      const monitor = spawnProcess("gsettings", ["monitor", schema], { stdio: ["ignore", "pipe", "ignore"] })
      monitor.stdout.on("data", onChanged)
      monitor.on("error", () => undefined)
      monitors.push(monitor)
    }
    return true
  }

  function stopMonitors() {
    for (const monitor of monitors.splice(0)) monitor.kill()
  }

  return { read, startMonitors, stopMonitors }
}

module.exports = {
  createDesktopEnvironmentService,
  panelForDisplay,
  parseRegistryValue,
  parseGSettingsArray,
  parseGSettingsString,
  readWindowsDesktopEnvironment,
  resolveWindowsWallpaperPath,
  wallpaperPathFromUri,
  windowsBackgroundColor,
  windowsWallpaperMode,
}
