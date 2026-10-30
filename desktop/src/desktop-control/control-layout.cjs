const fs = require('node:fs')
const path = require('node:path')

function readControlPlacement(filename) {
  try {
    const value = JSON.parse(fs.readFileSync(filename, 'utf8'))
    return { x: Number.isFinite(value.x) ? value.x : undefined, y: Number.isFinite(value.y) ? value.y : undefined,
      topmost: value.topmost !== false }
  } catch { return { topmost: true } }
}
function controlBounds(screen, position = {}) {
  const stored = Number.isFinite(position.x) && Number.isFinite(position.y)
  const display = stored ? screen.getDisplayMatching({ x: Math.round(position.x), y: Math.round(position.y), width: 420, height: 176 })
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea, width = Math.min(420, area.width), height = Math.min(176, area.height)
  return { width, height, x: Math.round(Math.max(area.x, Math.min(stored ? position.x : area.x + area.width - width - 24, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(stored ? position.y : area.y + 24, area.y + area.height - height))) }
}
function saveControlPlacement(filename, value) {
  if (!filename) return
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  // Match the existing desktop preference stores; readers can keep a Windows
  // file handle open while an atomic rename would fail with EPERM.
  fs.writeFileSync(filename, JSON.stringify(value) + '\n')
}
module.exports = { readControlPlacement, controlBounds, saveControlPlacement }
