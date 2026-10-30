import { useEffect, useRef, useState } from 'react'

export function useStartupOpening(ready: boolean, onComplete: () => void, active = true) {
  const complete = useRef(onComplete); complete.current = onComplete
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [played, setPlayed] = useState(false), [revealing, setRevealing] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => setReduced(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  useEffect(() => {
    if (!active) return
    if (reduced) { setPlayed(true); return }
    const timer = window.setTimeout(() => setPlayed(true), 2400)
    return () => window.clearTimeout(timer)
  }, [reduced, active])
  useEffect(() => {
    if (!active || !ready || !played) return
    if (reduced) { complete.current(); return }
    setRevealing(true)
    const timer = window.setTimeout(() => complete.current(), 800)
    return () => window.clearTimeout(timer)
  }, [ready, played, reduced, active])
  return { reduced, revealing, skipped: played && !ready, skip: () => setPlayed(true) }
}
