import { useId, useLayoutEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, Eye, EyeOff, Images, Move, UserRound, UserRoundCheck, UsersRound } from 'lucide-react'
import type { CharacterConfigurationView } from '../../lib/character-navigation'

export interface WorkbenchCharacterActions {
  origin: 'local' | 'mon'
  name?: string
  onConfigure?(view: CharacterConfigurationView): void
  onParticipants?(): void
  onDefault?(): void
  onShowPortrait(): void
  editing: boolean
  onToggleEditing(): void
}

export function WorkbenchCharacterMenu({ origin, name, onConfigure, onParticipants, onDefault, portraitVisible, onTogglePortrait, editing, onToggleEditing }: Omit<WorkbenchCharacterActions, 'onShowPortrait'> & {
  portraitVisible: boolean; onTogglePortrait(): void
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const first = useRef(0), id = useId()
  const items = origin === 'local' && onConfigure ? [
    { label: '基本信息', Icon: UserRound, run: () => onConfigure('basic') },
    { label: '完整角色', Icon: BookOpen, run: () => onConfigure('complete') },
    { label: '视觉资源', Icon: Images, run: () => onConfigure('visual') },
  ] : [
    ...(onParticipants ? [{ label: '选择会话角色', Icon: UsersRound, run: onParticipants }] : []),
    ...(onDefault ? [{ label: '设置默认角色', Icon: UserRoundCheck, run: onDefault }] : []),
  ]
  useLayoutEffect(() => {
    const panel = menu.current
    if (!open || !panel) return
    const position = () => {
      const box = trigger.current!.getBoundingClientRect()
      panel.style.maxHeight = `${Math.max(1, innerHeight - box.bottom - 16)}px`
      panel.style.left = `${Math.max(8, Math.min(box.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 8))}px`
      panel.style.top = `${box.bottom + 6}px`
    }
    panel.showPopover(); position()
    const buttons = panel.querySelectorAll<HTMLButtonElement>('button')
    buttons[first.current < 0 ? buttons.length - 1 : 0]?.focus()
    window.addEventListener('resize', position)
    return () => window.removeEventListener('resize', position)
  }, [open])
  const choose = (run: () => void) => { setOpen(false); run() }
  return <div className="workbench-character-control">
    <button ref={trigger} type="button" className="workbench-command" aria-label="角色" title="角色"
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { first.current = 0; setOpen(value => !value) }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); first.current = event.key === 'ArrowUp' ? -1 : 0; setOpen(true)
        }
      }}><UserRound size={16}/><ChevronDown size={12}/></button>
    {open && <div ref={menu} id={id} role="menu" aria-label="角色菜单" popover="auto" className="workbench-character-menu surface-scrollbars"
      onToggle={event => { if (event.newState === 'closed' && event.currentTarget.isConnected) setOpen(false) }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); return }
        if (event.key === 'Tab') { setOpen(false); trigger.current?.focus(); return }
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index + buttons.length - 1) % buttons.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1
        if (next >= 0) { event.preventDefault(); buttons[next]?.focus() }
      }}>
      <p className="workbench-character-name">{name || '角色'}</p>
      {items.map(({ label, Icon, run }) => <button key={label} type="button" role="menuitem" onClick={() => choose(run)}><Icon size={16}/>{label}</button>)}
      <div role="separator"/>
      <button type="button" role="menuitemcheckbox" aria-checked={portraitVisible} onClick={() => choose(onTogglePortrait)}>
        {portraitVisible ? <EyeOff size={16}/> : <Eye size={16}/>}<span>{portraitVisible ? '隐藏角色立绘' : '显示角色立绘'}</span>
      </button>
      <button type="button" role="menuitemcheckbox" aria-label="角色移动" aria-checked={editing} title="开启后可拖动角色、滚轮缩放；Esc 结束调整" onClick={() => choose(onToggleEditing)}>
        <Move size={16}/><span className="flex-1">角色移动</span><small className="text-text-muted">{editing ? '开启' : '关闭'}</small>
      </button>
    </div>}
  </div>
}
