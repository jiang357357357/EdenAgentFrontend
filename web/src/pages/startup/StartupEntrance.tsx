import { lazy, Suspense, useEffect, useState } from 'react'
import type { StartupScene } from './startup-assets'
import { useStartupSceneSelection } from './useStartupSceneSelection'
import { StartupSceneBoundary } from './StartupSceneBoundary'
import { StartupLoginStage, type StartupLoginPanelProps } from './StartupLoginPanel'
import { StartupSceneControls } from './StartupSceneControls'
import { StartupOpening } from './StartupOpening'
import { useStartupOpeningReplay } from './useStartupOpeningReplay'
import type { SceneCommand, StartupPhase } from './scene-transition'
import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'
import type { RuntimeOrigin } from '../../lib/runtime-origin'
import './startup.css'

const SceneCanvas = lazy(() => import('./StartupSceneCanvas'))
export interface StartupEntranceProps extends Omit<StartupLoginPanelProps, 'onBack' | 'visible' | 'onBounds' | 'characterBounds'> {
  scene?: StartupScene
  onChooseOrigin(origin: RuntimeOrigin): void
}
export function StartupEntrance(props: StartupEntranceProps) {
  const { scene, pose, poseCount, chooseLighting, nextPose } = useStartupSceneSelection(props.scene)
  const [phase, setPhase] = useState<StartupPhase>('room'), [command, setCommand] = useState<SceneCommand>('room')
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false)
  const [hasRendered, setHasRendered] = useState(false)
  const { opening, visible, sequence, complete } = useStartupOpeningReplay()
  const [protectedAreas, setProtectedAreas] = useState<SpineBounds[]>([])
  const [foregroundBounds, setForegroundBounds] = useState<SpineBounds>()
  const selectedOrigin = props.origin ?? 'mon'
  const active = phase !== 'room' && phase !== 'reacting'
  const ensureOrigin = () => { if (props.origin === null) props.onChooseOrigin(selectedOrigin) }
  const openDirectly = () => { ensureOrigin(); setCommand('login'); setPhase('login') }
  const activate = () => { ensureOrigin(); setCommand('wake'); setPhase('reacting') }
  const back = () => { if (!props.isSubmitting) { setCommand('room'); setPhase(ready && !failed ? 'returning' : 'room') } }
  const sceneError = (error: unknown) => { console.warn('[StartupScene] 场景不可用，回退到登录', error); setFailed(true); setForegroundBounds(undefined); setPhase('login') }
  const changeLighting = (night: boolean) => {
    if (phase !== 'room' || props.isSubmitting || scene.night === night) return
    setReady(false); setFailed(false); setProtectedAreas([]); chooseLighting(night)
  }
  useEffect(() => {
    if (phase === 'room' || phase === 'login') return
    let timer: number
    const schedule = () => { window.clearTimeout(timer); if (!document.hidden) timer = window.setTimeout(openDirectly, 8000) }
    schedule(); document.addEventListener('visibilitychange', schedule)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', schedule) }
  }, [phase])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (opening) return
      if (event.key === 'Escape' && phase !== 'room' && !props.isSubmitting) { event.preventDefault(); back() }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [phase, props.isSubmitting, opening])
  return <main className="startup-entrance fixed inset-0 isolate overflow-hidden bg-bg text-on-solid" data-startup-phase={phase} data-startup-scene={scene.night ? 'night' : 'day'} data-startup-pose={pose} data-startup-opening={opening}>
    <div className="absolute inset-0" data-startup-content inert={opening} aria-hidden={opening}>
    <div data-startup-room className="absolute inset-0" aria-hidden={phase !== 'room'} inert={phase !== 'room'}>
      {!hasRendered || failed ? <img src={scene.poster} alt="" className={`absolute inset-0 h-full w-full object-cover ${failed && active ? 'startup-fallback-covered' : ''}`} onError={event => { event.currentTarget.style.display = 'none' }} /> : null}
      {!failed ? <StartupSceneBoundary onError={sceneError}><Suspense fallback={null}>
        <SceneCanvas scene={scene} pose={pose} phase={phase} command={command} protectedAreas={protectedAreas} onReady={() => { setReady(true); setHasRendered(true) }} onError={sceneError}
          onActivate={activate} onPhase={setPhase}
          onForegroundBounds={value => setForegroundBounds(current => JSON.stringify(current) === JSON.stringify(value) ? current : value)} />
      </Suspense></StartupSceneBoundary> : null}
      {failed ? <button type="button" aria-label="打开登录" onClick={openDirectly} className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-highlight/80" /> : null}
    </div>
    <StartupSceneControls phase={phase} night={scene.night} ready={ready && !failed} pose={pose} poseCount={poseCount} onSkip={openDirectly}
      onChooseLighting={changeLighting} onNextPose={() => { if (phase === 'room' && ready && !failed && !props.isSubmitting) nextPose() }}
      origin={selectedOrigin} isSubmitting={props.isSubmitting} onChooseOrigin={props.onChooseOrigin} />
    <StartupLoginStage {...props} phase={phase} command={command} failed={failed} opening={opening}
      characterName={scene.name} night={scene.night} characterBounds={foregroundBounds} onBack={back}
      onBounds={bounds => setProtectedAreas(current => JSON.stringify(current[0]) === JSON.stringify(bounds) ? current : [bounds])} />
    </div>
    {opening ? <StartupOpening key={sequence} active={visible} ready={hasRendered || failed} onComplete={complete} /> : null}
  </main>
}
