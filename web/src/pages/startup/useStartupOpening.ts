import { useCallback, useEffect, useRef, useState } from 'react'

const revealDuration = 340
const playbackDeadline = 11000
const motionPreference = '(prefers-reduced-motion: reduce)'

export function useStartupOpening(onComplete: () => void, active: boolean) {
  const complete = useRef(onComplete); complete.current = onComplete
  const [reduced, setReduced] = useState(() => window.matchMedia(motionPreference).matches)
  const [playing, setPlaying] = useState(false), [revealing, setRevealing] = useState(false)
  const reveal = useCallback(() => setRevealing(true), [])
  useEffect(() => {
    const media = window.matchMedia(motionPreference)
    const changed = () => setReduced(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  useEffect(() => {
    if (!active) return
    if (reduced) { complete.current(); return }
    const timer = window.setTimeout(reveal, playbackDeadline)
    return () => window.clearTimeout(timer)
  }, [reduced, active, reveal])
  useEffect(() => {
    if (!active || !revealing || reduced) return
    const timer = window.setTimeout(() => complete.current(), revealDuration)
    return () => window.clearTimeout(timer)
  }, [active, revealing, reduced])
  return { reduced, playing, revealing, setPlaying, reveal, revealDuration }
}
