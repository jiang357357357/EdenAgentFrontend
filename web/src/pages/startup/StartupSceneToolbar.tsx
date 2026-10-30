import { Moon, PersonStanding, Sun } from 'lucide-react'

interface Props {
  night: boolean; disabled: boolean; ready: boolean; pose: string; poseCount: number
  onChooseLighting(night: boolean): void
  onNextPose(): void
}
const buttonClass = 'flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-highlight/80 disabled:cursor-default disabled:opacity-40'

export function StartupSceneToolbar({ night, disabled, ready, pose, poseCount, onChooseLighting, onNextPose }: Props) {
  const poseLabel = `当前第 ${Number(pose.slice(-2)) + 1} 组，共 ${poseCount} 组`
  return <div role="group" aria-label="场景控制" className="pointer-events-auto flex items-center gap-1 rounded-full border border-highlight/20 bg-scrim/20 p-1 text-on-solid shadow-sm backdrop-blur-md">
    {[{ Icon: Sun, value: false, label: '切换为白天' }, { Icon: Moon, value: true, label: '切换为夜晚' }].map(({ Icon, value, label }) =>
      <button key={label} type="button" aria-label={label} title={label} aria-pressed={night === value} disabled={disabled}
        onClick={() => onChooseLighting(value)}
        className={`${buttonClass} ${night === value ? 'bg-highlight/20 text-on-solid ring-1 ring-highlight/35' : 'text-on-solid/70 hover:bg-highlight/10 hover:text-on-solid'}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
      </button>)}
    <span className="mx-0.5 h-4 w-px bg-highlight/20" aria-hidden="true" />
    <button type="button" aria-label="切换角色动作" aria-description={poseLabel} title={`切换角色动作（${poseLabel}）`}
      disabled={disabled || !ready} onClick={onNextPose}
      className={`${buttonClass} text-on-solid/80 hover:bg-highlight/10 hover:text-on-solid`}>
      <PersonStanding className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
    </button>
  </div>
}
