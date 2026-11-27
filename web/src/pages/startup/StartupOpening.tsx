import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { isStartupNight } from './startup-assets'
import { useStartupOpening } from './useStartupOpening'
import './startup-opening.css'

export function StartupOpening({ active = true, night = isStartupNight(), onComplete, onSkip = onComplete }: {
  active?: boolean; night?: boolean; onComplete(): void; onSkip?(): void
}) {
  const { reduced, playing, revealing, setPlaying, reveal, revealDuration } = useStartupOpening(onComplete, active)
  const [source, setSource] = useState<string>()
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!active || reduced) return
    const controller = new AbortController()
    void fetch(new URL('startup-opening/eden-opening.html', document.baseURI), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Opening animation is unavailable')
        const html = await response.text()
        if (!html.includes('eden-startup-opening:complete')) throw new Error('Opening animation is invalid')
        if (!controller.signal.aborted) setSource(html)
      }).catch(() => { if (!controller.signal.aborted) reveal() })
    return () => controller.abort()
  }, [active, reduced, reveal])

  useEffect(() => {
    if (!active || reduced) return
    const onMessage = (event: MessageEvent) => {
      const sender = frame.current?.contentWindow
      if (!sender || event.source !== sender || event.origin !== 'null') return
      if (event.data === 'eden-startup-opening:playing') setPlaying(true)
      if (event.data === 'eden-startup-opening:complete') reveal()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [active, reduced, reveal, setPlaying])

  return <div data-startup-opening-overlay data-opening-phase={revealing ? 'revealing' : 'playing'} data-reduced-motion={reduced}
    data-opening-active={active} data-animation-playing={playing}
    style={{ '--opening-reveal-duration': `${revealDuration}ms` } as CSSProperties}
    className="startup-opening absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-scrim text-on-solid">
    {source && active && !reduced ? <iframe ref={frame} title="什亭之匣开场动画" tabIndex={-1} aria-hidden="true"
      sandbox="allow-scripts" className="startup-opening-animation"
      srcDoc={night ? source.replace('data-theme="arona"', 'data-theme="plana"') : source} onError={reveal} /> : null}
    <button type="button" onClick={onSkip} disabled={!active} aria-label="跳过开场动画"
      className="startup-opening-skip absolute flex items-center gap-3 rounded-full px-5 py-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-highlight/80">
      跳过动画<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  </div>
}
