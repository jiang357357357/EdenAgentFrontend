import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { BaseTheme } from '@eden/api'

const themes = [
  ['cream', '奶油米色'], ['peach', '暖杏桃色'], ['sage', '清新浅绿'],
  ['lavender', '雾紫暮色'], ['sky', '晴空浅蓝'], ['pink', '樱花浅粉'],
  ['teal', '海盐青绿'], ['white', '纯净素白'], ['night', '深色夜幕'],
  ['navy', '午夜藏蓝'], ['forest', '深林墨绿'],
] as const
interface Props { value: BaseTheme; disabled?: boolean; onChange: (theme: BaseTheme) => void }
type Position = { left: number; top: number; width: number; maxHeight: number }
type MenuProps = { id: string; value: BaseTheme; active: number; position: Position | null;
  menu: RefObject<HTMLUListElement | null>; onActive: (index: number) => void;
  onSelect: (index: number) => void; onKeyDown: (event: KeyboardEvent<HTMLElement>) => void }

function useMenuPosition(open: boolean, trigger: RefObject<HTMLButtonElement | null>,
  menu: RefObject<HTMLUListElement | null>, close: () => void) {
  const [position, setPosition] = useState<Position | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - 18, above = rect.top - 18
      const up = below < 210 && above > below, height = Math.max(0, Math.min(210, up ? above : below))
      const width = Math.min(rect.width, window.innerWidth - 24)
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: up ? rect.top - height - 6 : rect.bottom + 6, width, maxHeight: height })
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) close()
    }
    place()
    menu.current?.focus({ preventScroll: true })
    window.addEventListener('pointerdown', outside)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, trigger, menu, close])
  return position
}

function ThemeMenu({ id, value, active, position, menu, onActive, onSelect, onKeyDown }: MenuProps) {
  useEffect(() => {
    document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [id, active, position?.maxHeight])
  return <ul ref={menu} id={id} role="listbox" aria-labelledby={`${id}-label`} tabIndex={-1}
    aria-activedescendant={`${id}-${active}`} onKeyDown={onKeyDown}
    // The appearance panel must keep treating its portalled theme options as inside the panel.
    onPointerDown={event => event.stopPropagation()}
    style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
    className="fixed z-[100] overflow-y-auto rounded-lg border border-border bg-card py-1 text-sm text-text shadow-xl outline-none">
    {themes.map(([theme, label], index) => <li key={theme} id={`${id}-${index}`} role="option"
      aria-selected={value === theme} onPointerMove={() => onActive(index)} onClick={() => onSelect(index)}
      className={`flex min-h-10 cursor-pointer items-center gap-3 px-3 py-2 ${active === index ? 'bg-accent-dim' : 'hover:bg-surface-hover'}`}>
      <span data-theme-swatch={theme} aria-hidden="true" className="h-5 w-7 shrink-0 rounded border border-border/70" />
      <span className="flex-1">{label}</span>
      {value === theme && <Check aria-hidden="true" className="h-4 w-4 text-accent" />}
    </li>)}
  </ul>
}

export function BaseThemeSelect({ value, disabled = false, onChange }: Props) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLUListElement>(null)
  const selected = Math.max(0, themes.findIndex(([theme]) => theme === value))
  const [open, setOpen] = useState(false), [active, setActive] = useState(selected)
  const close = useCallback((focus = false) => { setOpen(false); if (focus) trigger.current?.focus({ preventScroll: true }) }, [])
  const visible = open && !disabled
  const position = useMenuPosition(visible, trigger, menu, close)
  useEffect(() => { if (disabled) close() }, [disabled, close])
  const show = (index = selected) => { setActive(index); setOpen(true) }
  const choose = (index: number) => { onChange(themes[index][0]); close(true) }
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    const steps: Record<string, number> = { ArrowDown: (active + 1) % themes.length,
      ArrowUp: (active + themes.length - 1) % themes.length, Home: 0, End: themes.length - 1 }
    if (event.key in steps) { event.preventDefault(); setActive(steps[event.key]); return }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active) }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
    if (event.key === 'Tab') close(true)
  }
  return <div className="mb-4">
    <span id={`${id}-label`} className="mb-3 block text-xs font-medium text-text-muted">整体主题</span>
    <button ref={trigger} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={visible}
      aria-controls={visible ? id : undefined} aria-labelledby={`${id}-label ${id}-value`}
      onClick={() => visible ? close() : show()}
      onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); show(event.key === 'Home' ? 0 : event.key === 'End' ? themes.length - 1 : selected)
        }
      }}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-input px-3 py-2 text-left text-sm text-text outline-none hover:border-accent/50 focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50">
      <span data-theme-swatch={value} aria-hidden="true" className="h-5 w-7 shrink-0 rounded border border-border/70" />
      <span id={`${id}-value`} className="flex-1">{themes[selected][1]}</span>
      <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${visible ? 'rotate-180' : ''}`} />
    </button>
    {visible && createPortal(<ThemeMenu id={id} value={value} active={active} position={position} menu={menu}
      onActive={setActive} onSelect={choose} onKeyDown={keyDown} />, document.body)}
  </div>
}
