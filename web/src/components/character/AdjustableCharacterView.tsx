import { useEffect, useRef, useState, type ReactNode } from 'react'

type Placement = { x: number; y: number; scale: number }
const initial: Placement = { x: 0, y: 0, scale: 1 }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
function load(key: string): Placement {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (value && [value.x, value.y, value.scale].every(Number.isFinite)) {
      return { x: clamp(value.x, -1, 1), y: clamp(value.y, -1, 1), scale: clamp(value.scale, .25, 3) }
    }
  } catch { /* Unavailable storage leaves the default placement usable. */ }
  return initial
}

export function AdjustableCharacterView({ storageKey, editing, children }: {
  storageKey: string; editing: boolean; children: ReactNode
}) {
  const [placement, setPlacement] = useState(() => load(storageKey))
  const overlay = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  useEffect(() => {
    const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(placement)) } catch { /* Placement still works for this visit. */ } }
    const timer = window.setTimeout(save, 200)
    return () => { window.clearTimeout(timer); save() }
  }, [placement, storageKey])
  useEffect(() => {
    const element = overlay.current
    if (!editing || !element) { drag.current = null; return }
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation()
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
      setPlacement(current => ({ ...current, scale: clamp(current.scale * Math.exp(-clamp(pixels, -200, 200) * .002), .25, 3) }))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [editing])
  return <div className="absolute inset-0 overflow-hidden">
    <div className="absolute inset-0" style={{ transform: `translate(${placement.x * 100}%, ${placement.y * 100}%) scale(${placement.scale})`, transformOrigin: '50% 50%' }}>
      {children}
    </div>
    {editing ? <>
      <div ref={overlay} className="absolute inset-0 z-20 cursor-move touch-none select-none" aria-label="拖动角色，滚轮缩放"
        onPointerDown={event => {
          if (event.button !== 0) return
          event.preventDefault(); event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
        }}
        onPointerMove={event => {
          const previous = drag.current
          if (!previous || previous.id !== event.pointerId) return
          const width = event.currentTarget.clientWidth, height = event.currentTarget.clientHeight
          const dx = event.clientX - previous.x, dy = event.clientY - previous.y
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
          if (width && height) setPlacement(current => ({ ...current, x: clamp(current.x + dx / width, -1, 1), y: clamp(current.y + dy / height, -1, 1) }))
        }}
        onPointerUp={event => { if (drag.current?.id === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) } }}
        onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
      />
      <div className="absolute left-3 right-3 top-3 z-30 flex items-center justify-between gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-sm shadow-sm">
        <span>拖动调整位置 · 滚轮缩放 {Math.round(placement.scale * 100)}%</span>
        <button type="button" onClick={() => setPlacement(initial)} className="shrink-0 rounded border border-border px-2 py-1 hover:text-accent">重置</button>
      </div>
    </> : null}
  </div>
}
