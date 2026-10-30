import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'

export function overlaps(a: SpineBounds, b: SpineBounds) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}
function split(region: SpineBounds, obstacle: SpineBounds): SpineBounds[] {
  if (!overlaps(region, obstacle)) return [region]
  const right = region.x + region.width, bottom = region.y + region.height
  return [
    { ...region, width: Math.min(right, obstacle.x) - region.x },
    { ...region, x: Math.max(region.x, obstacle.x + obstacle.width), width: right - Math.max(region.x, obstacle.x + obstacle.width) },
    { ...region, height: Math.min(bottom, obstacle.y) - region.y },
    { ...region, y: Math.max(region.y, obstacle.y + obstacle.height), height: bottom - Math.max(region.y, obstacle.y + obstacle.height) },
  ]
}
function contains(a: SpineBounds, b: SpineBounds) {
  return a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height
}
// Port of lockscreen/shittimBackground.py:foreground_layout. Coordinates are pixels.
// The original intentionally allows a lower-body crop below the viewport.
export function foregroundLayout(width: number, height: number, protectedAreas: SpineBounds[], aspect: number): SpineBounds | undefined {
  const margin = Math.max(12, Math.min(width, height) * .025)
  let regions: SpineBounds[] = [{ x: margin, y: height * .17, width: width - 2 * margin, height: height * 1.03 }]
  for (const item of protectedAreas) {
    const obstacle = { x: item.x - margin, y: item.y - margin, width: item.width + 2 * margin, height: item.height + 2 * margin }
    const candidates = regions.flatMap(region => split(region, obstacle)).filter(rect => rect.width > 1 && rect.height > 1)
      .sort((a, b) => b.width * b.height - a.width * a.height)
    regions = candidates.filter((rect, index) => !candidates.slice(0, index).some(other => contains(other, rect))).slice(0, 64)
  }
  regions = regions.filter(rect => rect.y < height - Math.min(160, height * .22))
  if (!regions.length) return undefined
  const capacity = (rect: SpineBounds) => Math.min(height * 1.03, rect.height, rect.width / aspect)
  const largest = Math.max(...regions.map(capacity))
  const rect = regions.filter(rect => capacity(rect) >= largest * .92).sort((a, b) => a.x - b.x || capacity(b) - capacity(a))[0]
  const fitHeight = capacity(rect)
  if (fitHeight < Math.min(160, height * .22)) return undefined
  const fitWidth = fitHeight * aspect
  return { x: rect.x + Math.min(width * .025, (rect.width - fitWidth) / 2), y: rect.y, width: fitWidth, height: fitHeight }
}
