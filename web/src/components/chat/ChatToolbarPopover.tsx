import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'

/** Native top-layer placement keeps group headers from clipping their menus. */
export function ChatToolbarPopover({ anchor, label, className, onClose, children }: {
  anchor: RefObject<HTMLElement | null>; label: string; className: string; onClose(): void; children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const position = () => {
      const button = anchor.current?.querySelector('button')
      if (!button) return
      const box = button.getBoundingClientRect()
      const below = innerHeight - box.bottom - 12, above = box.top - 12
      const upward = below < 180 && above > below
      element.style.maxHeight = `${Math.max(1, upward ? above : below)}px`
      const menu = element.getBoundingClientRect()
      element.style.left = `${Math.max(8, Math.min(box.right - menu.width, innerWidth - menu.width - 8))}px`
      element.style.top = `${upward ? Math.max(8, box.top - menu.height - 6) : box.bottom + 6}px`
    }
    element.showPopover()
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [anchor])
  return <div ref={panel} popover="manual" role="dialog" aria-label={label} className={className}
    style={{ position: 'fixed', margin: 0, inset: 'auto', overflowY: 'auto' }}
    onToggle={event => { if (event.newState === 'closed') onClose() }}>{children}</div>
}
