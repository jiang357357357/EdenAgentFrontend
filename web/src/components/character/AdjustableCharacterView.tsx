import { CharacterPlacementContext } from './character-placement-context'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { defaultCharacterPlacement as initial, readCharacterPlacement, writeCharacterPlacement } from './character-placement-storage'
import type { CharacterPlacement as Placement } from './character-placement-context'
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
function load(key: string) {
  try { return { placement: readCharacterPlacement(localStorage, key), error: '' } }
  catch { return { placement: initial, error: '无法读取已保存的位置，请检查应用存储。' } }
}

export function AdjustableCharacterView({ storageKey, editing, children, nativeTransform = false }: {
  storageKey: string; editing: boolean; children: ReactNode; nativeTransform?: boolean
}) {
  const [loaded] = useState(() => load(storageKey))
  const [placement, setPlacement] = useState(loaded.placement)
  const [storageError, setStorageError] = useState(loaded.error)
  const currentPlacement = useRef(loaded.placement)
  const updatePlacement = useCallback((update: Placement | ((current: Placement) => Placement)) => {
    const next = typeof update === 'function' ? update(currentPlacement.current) : update
    currentPlacement.current = next
    // Persist in the input handler, before React rendering or window teardown.
    try { writeCharacterPlacement(localStorage, storageKey, next); setStorageError('') }
    catch { setStorageError('位置未保存：应用存储不可用，重新打开后可能丢失。') }
    setPlacement(next)
  }, [storageKey])
  const overlay = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  useEffect(() => {
    const element = overlay.current
    if (!editing || !element) { drag.current = null; return }
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation()
      if (event.deltaY === 0) return
      updatePlacement(current => ({ ...current, scale: clamp(Math.round((current.scale - Math.sign(event.deltaY) * .05) * 100) / 100, .25, 3) }))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [editing, updatePlacement])
  return <div className="absolute inset-0 overflow-hidden">
    <div className="absolute inset-0" style={nativeTransform ? undefined : { transform: `translate(${placement.x * 100}%, ${placement.y * 100}%) scale(${placement.scale})`, transformOrigin: '50% 50%' }}>
      <CharacterPlacementContext.Provider value={nativeTransform ? placement : null}>{children}</CharacterPlacementContext.Provider>
    </div>
    {storageError ? <p role="alert" className="absolute bottom-3 left-3 right-3 z-30 rounded border border-red-200 bg-card p-2 text-sm text-red-600">{storageError}</p> : null}
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
          if (width && height) updatePlacement(current => ({ ...current, x: clamp(current.x + dx / width, -1, 1), y: clamp(current.y + dy / height, -1, 1) }))
        }}
        onPointerUp={event => { if (drag.current?.id === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) } }}
        onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
      />
      <div className="absolute left-3 right-3 top-3 z-30 flex items-center justify-between gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-sm shadow-sm">
        <span>拖动调整位置 · 滚轮缩放 {Math.round(placement.scale * 100)}%</span>
        <button type="button" onClick={() => updatePlacement(initial)} className="shrink-0 rounded border border-border px-2 py-1 hover:text-accent">重置</button>
      </div>
    </> : null}
  </div>
}
