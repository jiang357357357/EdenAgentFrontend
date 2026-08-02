const fs = require("node:fs")
const path = require("node:path")

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
  const cacheDir = path.join(appData, "Microsoft", "Windows", "Themes", "CachedFiles")
  try {
    return fileSystem
      .readdirSync(cacheDir)
      .map((name) => path.join(cacheDir, name))
      .filter((filePath) => fileSystem.statSync(filePath).isFile())
      .sort((left, right) => fileSystem.statSync(right).mtimeMs - fileSystem.statSync(left).mtimeMs)
  } catch {
    return []
  }
}

function resolveWindowsWallpaperPath(registryPath, appData, fileSystem = fs) {
  const candidates = [registryPath]
  if (appData) {
    candidates.push(path.join(appData, "Microsoft", "Windows", "Themes", "TranscodedWallpaper"))
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

module.exports = {
  parseRegistryValue,
  readWindowsDesktopEnvironment,
  resolveWindowsWallpaperPath,
  windowsBackgroundColor,
  windowsWallpaperMode,
}
