import { useEffect } from 'react'

/** A native load event can precede React's first visible frame. */
export function DesktopRendererReady() {
  useEffect(() => {
    const ready = window.edenAgentDesktop?.rendererReady
    if (!ready || new URLSearchParams(window.location.search).has('page')) return
    let second: number | undefined
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => ready())
    })
    return () => {
      window.cancelAnimationFrame(first)
      if (second !== undefined) window.cancelAnimationFrame(second)
    }
  }, [])
  return null
}
