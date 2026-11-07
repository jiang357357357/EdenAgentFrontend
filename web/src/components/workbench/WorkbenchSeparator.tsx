import { useRef } from 'react'

export function WorkbenchSeparator({ label, value, min, max, reverse = false, horizontal = false, onChange }: {
  label: string; value: number; min: number; max: number; reverse?: boolean; horizontal?: boolean; onChange: (value: number) => void
}) {
  const start = useRef<{ point: number; value: number } | null>(null)
  const change = (next: number) => onChange(Math.round(Math.min(max, Math.max(min, next))))
  return <div className={`workbench-separator ${horizontal ? 'horizontal' : ''}`} role="separator" tabIndex={0}
    aria-label={label} aria-orientation={horizontal ? 'horizontal' : 'vertical'} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}
    onPointerDown={event => {
      if (event.button !== 0) return
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
      start.current = { point: horizontal ? event.clientY : event.clientX, value }
    }}
    onPointerMove={event => {
      if (start.current) change(start.current.value + ((horizontal ? event.clientY : event.clientX) - start.current.point) * (reverse ? -1 : 1))
    }}
    onPointerUp={event => { start.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }}
    onLostPointerCapture={() => { start.current = null }}
    onKeyDown={event => {
      const negative = horizontal ? 'ArrowUp' : 'ArrowLeft', positive = horizontal ? 'ArrowDown' : 'ArrowRight'
      if (event.key === negative || event.key === positive) { event.preventDefault(); change(value + (event.key === negative ? -16 : 16) * (reverse ? -1 : 1)) }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); change(event.key === 'Home' ? min : max) }
    }} />
}
