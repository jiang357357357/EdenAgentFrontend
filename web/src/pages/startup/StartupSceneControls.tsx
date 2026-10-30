import { ChevronDown } from 'lucide-react'
import type { RuntimeOrigin } from '../../lib/runtime-origin'
import { StartupSceneToolbar } from './StartupSceneToolbar'

interface Props {
  phase: string; night: boolean; ready: boolean; pose: string; poseCount: number
  origin: RuntimeOrigin; isSubmitting: boolean
  onChooseOrigin(origin: RuntimeOrigin): void
  onChooseLighting(night: boolean): void
  onNextPose(): void
  onSkip(): void
}
export function StartupSceneControls({ phase, night, ready, pose, poseCount, origin, isSubmitting, onChooseOrigin, onChooseLighting, onNextPose, onSkip }: Props) {
  return <>
    <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-scrim/30 to-transparent px-6 py-5 text-xs tracking-[.2em]">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
        <label className="pointer-events-auto flex items-center gap-2 tracking-normal">
          <span className="relative text-text">
            <select aria-label="运行模式" value={origin} disabled={phase !== 'room' || isSubmitting}
              onChange={event => onChooseOrigin(event.target.value === 'local' ? 'local' : 'mon')}
              className="h-9 appearance-none rounded-lg border border-border bg-card/95 py-1 pl-3 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:opacity-60">
              <option value="mon">伊甸园</option><option value="local">尘世</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </label>
      </div>
      <StartupSceneToolbar night={night} ready={ready} pose={pose} poseCount={poseCount} disabled={phase !== 'room' || isSubmitting}
        onChooseLighting={onChooseLighting} onNextPose={onNextPose} />
    </header>
    {phase !== 'room' && phase !== 'login' ? <button type="button" onClick={onSkip} className="absolute bottom-6 right-6 rounded-full border border-highlight/35 bg-scrim/20 px-4 py-2 text-sm">跳过动画</button> : null}
  </>
}
