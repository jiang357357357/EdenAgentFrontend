import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'

export function useStartupLoginGeometry(dialog: RefObject<HTMLDivElement | null>, onBounds?: (bounds: SpineBounds) => void) {
  const latest = useRef(onBounds); latest.current = onBounds
  const [geometry, setGeometry] = useState<{ panel?: SpineBounds; viewport: { width: number; height: number } }>(() => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }))
  useLayoutEffect(() => {
    const root = dialog.current
    if (!root) return
    const measure = () => {
      const { x, y, width, height } = root.getBoundingClientRect(), panel = { x, y, width, height }
      const next = { panel, viewport: { width: window.innerWidth, height: window.innerHeight } }
      setGeometry(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
      latest.current?.(panel)
    }
    const observer = new ResizeObserver(measure); observer.observe(root); measure()
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure) }
  }, [dialog])
  return geometry
}
