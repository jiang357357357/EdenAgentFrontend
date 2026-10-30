import { useEffect, useId, useRef } from 'react'
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react'
import { LoginForm } from '../login/LoginForm'
import { StartupLoginGreeting } from './StartupLoginGreeting'
import { useStartupLoginGeometry } from './useStartupLoginGeometry'
import type { RuntimeOrigin } from '../../lib/runtime-origin'
import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'
import type { SceneCommand, StartupPhase } from './scene-transition'

export interface StartupLoginPanelProps {
  origin: RuntimeOrigin | null
  authStatus: 'checking' | 'authenticated' | 'unauthenticated'
  isSubmitting: boolean; error?: string; userName?: string
  onLogin(username: string, password: string): Promise<void>
  onContinue(): void
  onBack(): void
  visible?: boolean
  characterName?: string; night?: boolean
  characterBounds?: SpineBounds
  onBounds?(bounds: SpineBounds): void
}
interface StartupLoginStageProps extends StartupLoginPanelProps {
  phase: StartupPhase; command: SceneCommand; failed: boolean; opening: boolean
}
export function StartupLoginStage({ phase, command, failed, opening, ...props }: StartupLoginStageProps) {
  if (command === 'room' && !(failed && phase === 'login')) return null
  return <StartupLoginPanel {...props} visible={!opening && phase === 'login'} />
}
export function StartupLoginPanel(props: StartupLoginPanelProps) {
  const selected = props.origin ?? 'mon'
  const dialog = useRef<HTMLDivElement>(null), submitted = useRef(false)
  const latest = useRef(props); latest.current = props
  const visible = props.visible !== false
  const authenticated = props.authStatus === 'authenticated' && props.origin === selected
  const checking = props.authStatus === 'checking' && props.origin === selected
  const geometry = useStartupLoginGeometry(dialog, props.onBounds), greetingId = useId()
  const greeting = props.characterBounds && geometry.panel ? <StartupLoginGreeting id={greetingId} name={props.characterName ?? '阿罗娜'} night={props.night === true}
    actor={props.characterBounds} panel={geometry.panel} viewport={geometry.viewport} /> : null
  useEffect(() => {
    if (!visible) return
    const root = dialog.current
    ;(root?.querySelector<HTMLInputElement>('input:not(:disabled)') ?? root?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus()
  }, [checking, authenticated, selected, visible])
  useEffect(() => {
    if (visible && submitted.current && props.authStatus === 'authenticated' && props.origin === 'mon' && !props.isSubmitting) latest.current.onContinue()
  }, [props.authStatus, props.isSubmitting, props.origin, visible])
  useEffect(() => {
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || latest.current.visible === false) return
      const items = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []]
      const target = event.shiftKey ? items.at(-1) : items[0]
      if (event.shiftKey ? document.activeElement === items[0] : document.activeElement === items.at(-1)) { event.preventDefault(); target?.focus() }
    }
    window.addEventListener('keydown', trap)
    return () => window.removeEventListener('keydown', trap)
  }, [])
  return <section className="pointer-events-none absolute inset-0" style={{ visibility: visible ? 'visible' : 'hidden' }} inert={!visible} aria-hidden={!visible}
    role={visible ? 'dialog' : undefined} aria-modal={visible ? true : undefined} aria-label="登录 Eden Agent"
    aria-describedby={greeting?.props.id}>
    <div className="startup-login absolute inset-y-0 right-0 flex items-center justify-center p-5 sm:p-8">
    <div ref={dialog} data-startup-login-panel className={`startup-login-panel pointer-events-auto ${visible ? 'startup-login-panel-visible' : ''} max-h-[calc(100dvh-40px)] w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-card/95 p-6 text-text shadow-2xl backdrop-blur-xl`}>
      <button type="button" disabled={props.isSubmitting} onClick={props.onBack} className="mb-4 flex items-center gap-2 text-xs text-text-muted hover:text-text disabled:opacity-50"><ArrowLeft className="h-3.5 w-3.5" />返回教室</button>
      {selected === 'local' ? <div><h2 className="font-serif text-3xl">进入尘世</h2><p className="mb-6 mt-3 text-sm text-text-muted">使用本地角色与模型，进入尘世。</p>
        <button type="button" onClick={props.onContinue} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm text-on-accent">进入尘世<ArrowRight className="h-4 w-4" /></button></div>
        : checking ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />正在确认登录状态…</p>
        : authenticated ? <div><h2 className="font-serif text-3xl">账号已就绪</h2><p className="mb-6 mt-3 text-sm text-text-muted">{props.userName || '老师'}，已准备好进入伊甸园。</p>
          <button type="button" onClick={props.onContinue} className="h-11 w-full rounded-xl bg-accent text-sm text-on-accent">进入伊甸园</button></div>
        : <LoginForm compact isSubmitting={props.isSubmitting} error={props.error} onLogin={async (username, password) => { submitted.current = true; await props.onLogin(username, password) }} />}
    </div>
    </div>
    {greeting}
  </section>
}
