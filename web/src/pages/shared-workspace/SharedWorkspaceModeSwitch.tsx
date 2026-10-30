import { Cloud, Network } from 'lucide-react'
import { sharedModeLabels, type SharedWorkspaceMode } from '../../components/shared-workspace/shared-workspace-mode'

export function SharedWorkspaceModeSwitch({ mode, busy, deploying, onSelect }: {
  mode: SharedWorkspaceMode | null; busy: boolean; deploying: boolean; onSelect(mode: SharedWorkspaceMode): void
}) {
  const cloud = mode === 'cloud'
  const disabled = busy || deploying || mode === null
  const Icon = cloud ? Cloud : Network
  return <button type="button" role="switch" aria-label="云主机共享" aria-checked={cloud} disabled={disabled}
    aria-busy={busy || deploying} data-state={cloud ? 'on' : 'off'} data-mode={mode ?? 'loading'}
    title={cloud ? '当前为云主机共享，点击切换到局域网共享' : '当前为局域网共享，点击切换到云主机共享'}
    onClick={() => { if (!disabled) onSelect(cloud ? 'lan' : 'cloud') }}
    className={`inline-flex min-w-0 items-center justify-center gap-3 whitespace-nowrap rounded-lg border px-3 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-library-bg disabled:cursor-wait disabled:opacity-50 sm:px-4 ${cloud
      ? 'border-accent/60 bg-accent/20 font-semibold text-accent shadow-inner' : 'border-border text-text-muted hover:bg-library-card hover:text-text'}`}>
    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
    <span>{mode ? sharedModeLabels[mode] : '读取共享模式'}</span>
    <span aria-hidden="true" className={`relative h-7 w-14 shrink-0 rounded-full border text-[10px] font-semibold leading-none ${cloud ? 'border-accent bg-accent text-on-accent' : 'border-border bg-library-card text-text-muted'}`}>
      <span className={`absolute top-1/2 -translate-y-1/2 ${cloud ? 'left-1.5' : 'right-1.5'}`}>{mode ? cloud ? 'ON' : 'OFF' : '…'}</span>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-highlight shadow-sm transition-transform motion-reduce:transition-none ${cloud ? 'translate-x-7' : 'translate-x-0'}`} />
    </span>
    {deploying ? <span className="text-xs">部署中</span> : null}
  </button>
}
