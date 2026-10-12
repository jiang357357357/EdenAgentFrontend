import { useEffect, useRef, useState } from "react"

const revealedTextCache = new Map<string, string>()
let cachedCharacters = 0
const MAX_CACHED_CHARACTERS = 1_000_000

function rememberRevealedText(key: string, value: string) {
  cachedCharacters -= revealedTextCache.get(key)?.length ?? 0
  revealedTextCache.delete(key)
  if (value.length > MAX_CACHED_CHARACTERS) return
  revealedTextCache.set(key, value)
  cachedCharacters += value.length
  while (revealedTextCache.size > 300 || cachedCharacters > MAX_CACHED_CHARACTERS) {
    const firstKey = revealedTextCache.keys().next().value
    if (firstKey === undefined) break
    cachedCharacters -= revealedTextCache.get(firstKey)?.length ?? 0
    revealedTextCache.delete(firstKey)
  }
}

export function useTypewriterText({
  active,
  cacheKey,
  target,
  onFrame,
}: {
  active: boolean
  cacheKey: string
  target: string
  onFrame?: () => void
}) {
  const [visible, setVisible] = useState(() => (active ? revealedTextCache.get(cacheKey) ?? "" : target))
  const cursor = useRef({ key: cacheKey, visible, target, active, frame: 0 })
  const onFrameRef = useRef(onFrame)

  useEffect(() => { onFrameRef.current = onFrame }, [onFrame])
  useEffect(() => () => {
    cancelAnimationFrame(cursor.current.frame)
    cursor.current.frame = 0
  }, [])

  useEffect(() => {
    const state = cursor.current
    const publish = (value: string) => {
      if (value === state.visible) return
      state.visible = value
      rememberRevealedText(cacheKey, value)
      setVisible(value)
      onFrameRef.current?.()
    }
    if (state.key !== cacheKey) {
      cancelAnimationFrame(state.frame)
      state.frame = 0
      state.key = cacheKey
      state.visible = active ? revealedTextCache.get(cacheKey) ?? "" : target
      setVisible(state.visible)
    }
    state.target = target
    state.active = active
    if (!active || !target.startsWith(state.visible)) {
      cancelAnimationFrame(state.frame)
      state.frame = 0
      publish(target)
      return
    }
    if (state.frame || state.visible.length >= target.length) return

    let lastTick = performance.now()
    let lastPaint = lastTick
    let carry = 0

    const tick = (now: number) => {
      state.frame = 0
      const remaining = state.target.length - state.visible.length
      if (!state.active || remaining <= 0) return
      const charsPerSecond = remaining > 600 ? 260 : remaining > 220 ? 170 : remaining > 80 ? 105 : 48
      carry += Math.max(now - lastTick, 0) / 1000 * charsPerSecond
      lastTick = now
      // A reveal reparses Markdown. Paint at most 20 times/s, or 10 for long
      // replies, rather than rebuilding a growing syntax tree on every RAF.
      const paintInterval = state.target.length > 4_000 ? 100 : 50
      if (now - lastPaint >= paintInterval && carry >= 1) {
        const step = Math.floor(carry)
        carry -= step
        lastPaint = now
        publish(state.target.slice(0, state.visible.length + step))
      }
      if (state.visible.length < state.target.length) state.frame = requestAnimationFrame(tick)
    }

    state.frame = requestAnimationFrame(tick)
  }, [active, cacheKey, target])

  // Completion and stream resets are visible immediately; animation must not
  // hide the final tail, an abort result, or content from a different segment.
  if (!active || !target.startsWith(visible)) return target
  if (cursor.current.key !== cacheKey) {
    const cached = revealedTextCache.get(cacheKey) ?? ""
    return target.startsWith(cached) ? cached : target
  }
  return visible
}
