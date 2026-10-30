import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'

interface Viewport { width: number; height: number }
interface Options { obstacles?: SpineBounds[]; maxWidth?: number }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
const overlap = (a: SpineBounds, b: SpineBounds) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

export function dialogueBubbleLayout(actor: SpineBounds, viewport: Viewport, measuredHeight: number, options: Options = {}) {
  const margin = 16, gap = 18, width = Math.max(1, Math.min(options.maxWidth ?? 272, viewport.width - margin * 2))
  const height = Math.min(measuredHeight, Math.max(1, viewport.height - margin * 2))
  const minY = Math.min(84, Math.max(margin, viewport.height - height - margin))
  const target = { x: actor.x + actor.width / 2, y: actor.y + Math.min(70, actor.height * .2) }
  const candidates = [
    { x: actor.x + actor.width + gap, y: target.y - height / 2, tail: 'left' },
    { x: actor.x - width - gap, y: target.y - height / 2, tail: 'right' },
    { x: target.x - width / 2, y: actor.y - height - gap, tail: 'bottom' },
    { x: target.x - width / 2, y: actor.y + actor.height + gap, tail: 'top' },
    ...(options.obstacles ?? []).flatMap(obstacle => [obstacle.y - height - gap, obstacle.y + obstacle.height + gap].flatMap(y => [
      { x: actor.x + actor.width + gap, y, tail: 'left' },
      { x: actor.x - width - gap, y, tail: 'right' },
    ])),
  ]
  const ranked = candidates.map(candidate => {
    const rect = { ...candidate, x: clamp(candidate.x, margin, Math.max(margin, viewport.width - width - margin)),
      y: clamp(candidate.y, minY, Math.max(minY, viewport.height - height - margin)), width, height }
    const distance = Math.abs(rect.x + width / 2 - target.x) + Math.abs(rect.y + height / 2 - target.y)
    const obstruction = (options.obstacles ?? []).reduce((total, obstacle) => total + overlap(rect, obstacle), 0)
    const verticalPenalty = options.obstacles?.length && !['left', 'right'].includes(rect.tail) ? 160 : 0
    return { ...rect, score: obstruction * 10000 + overlap(rect, actor) * 100 + distance + verticalPenalty }
  }).sort((a, b) => a.score - b.score)
  const result = ranked[0], vertical = result.tail === 'left' || result.tail === 'right'
  const tailOffset = vertical ? clamp(target.y - result.y, 22, height - 22) : clamp(target.x - result.x, 22, width - 22)
  return { ...result, tailOffset }
}
