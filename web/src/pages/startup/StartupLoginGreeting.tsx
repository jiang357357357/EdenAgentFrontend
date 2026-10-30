import { Sparkles } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { startupLoginLines } from './startup-dialogue-lines'
import { dialogueBubbleLayout } from './dialogue-bubble-layout'
import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'

interface Props {
  id: string; name: string; night: boolean; actor: SpineBounds; panel: SpineBounds
  viewport: { width: number; height: number }
}
export function StartupLoginGreeting({ id, name, night, actor, panel, viewport }: Props) {
  const element = useRef<HTMLDivElement>(null), [height, setHeight] = useState(100)
  const head = { x: actor.x + actor.width * .2, y: actor.y, width: actor.width * .6, height: Math.min(160, actor.height * .28) }
  const rightEdge = panel.x >= head.x + head.width ? panel.x - 18 : viewport.width - 16
  const room = Math.max(rightEdge - head.x - head.width - 18, head.x - 34)
  const maxWidth = Math.max(160, Math.min(248, room))
  const layout = dialogueBubbleLayout(head, viewport, height, { obstacles: [panel], maxWidth })
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => { if (element.current) setHeight(element.current.getBoundingClientRect().height) })
    if (element.current) observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  const style = { left: layout.x, top: layout.y, width: layout.width, maxHeight: viewport.height - 32,
    '--bubble-tail-offset': `${layout.tailOffset}px` } as CSSProperties
  return <div ref={element} id={id} data-startup-login-dialogue data-tail={layout.tail} style={style}
    className="startup-dialogue pointer-events-none absolute rounded-2xl border border-border/60 bg-card/95 px-4 py-3 text-text shadow-lg backdrop-blur-sm">
    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-accent"><Sparkles className="h-3 w-3" aria-hidden="true" />{name}</p>
    <p role="status" aria-live="polite" aria-atomic="true" className="text-sm leading-relaxed text-text">{startupLoginLines[night ? 'night' : 'day']}</p>
  </div>
}
