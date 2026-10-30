import { ChevronRight, Sparkles } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'
import { dialogueBubbleLayout } from './dialogue-bubble-layout'
import { startupIdleLines } from './startup-dialogue-lines'

interface Props {
  name: string; night: boolean; pose: string; actor: SpineBounds
  viewport: { width: number; height: number }
}
export function StartupDialogueBubble({ name, night, pose, actor, viewport }: Props) {
  const element = useRef<HTMLButtonElement>(null)
  const [turn, setTurn] = useState(0), [height, setHeight] = useState(100)
  const lines = startupIdleLines[night ? 'night' : 'day']
  const line = lines[(Number(pose.slice(-2)) + turn) % lines.length] ?? lines[0]
  const layout = dialogueBubbleLayout(actor, viewport, height)
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => { if (element.current) setHeight(element.current.getBoundingClientRect().height) })
    if (element.current) observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  const style = { left: layout.x, top: layout.y, width: layout.width, maxHeight: viewport.height - 32,
    '--bubble-tail-offset': `${layout.tailOffset}px` } as CSSProperties
  return <button ref={element} type="button" data-startup-dialogue data-tail={layout.tail} style={style}
    aria-label={`听${name}说下一句`} title="点击听下一句" onClick={() => setTurn(current => current + 1)}
    className="startup-dialogue absolute rounded-2xl border border-border/60 bg-card/95 px-4 py-3 text-left text-text shadow-lg backdrop-blur-sm outline-none transition-shadow hover:shadow-xl focus-visible:ring-2 focus-visible:ring-accent/80">
    <span className="flex items-center gap-1.5 text-xs font-medium text-accent"><Sparkles className="h-3 w-3" aria-hidden="true" />{name}<ChevronRight className="ml-auto h-3.5 w-3.5 text-text-muted" aria-hidden="true" /></span>
    <span role="status" aria-live="polite" aria-atomic="true" className="mt-2 block text-sm leading-relaxed">{line}</span>
  </button>
}
