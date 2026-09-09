import { useState } from 'react'
import { modelSelection } from '../../../lib/runtime-models'
import type { RuntimeModelConfig, RuntimeModelOption, ModelSelectionTarget } from '../../../lib/runtime-models'
import { cn } from '../../../lib/utils'

interface Props {
  config: RuntimeModelConfig
  submitting: string | null
  overlay: boolean
  onSelect(option: RuntimeModelOption, target?: ModelSelectionTarget): void
}

export function ModelSelectionMenu({ config, submitting, overlay, onSelect }: Props) {
  const [targetKey, setTargetKey] = useState('director')
  const selection = modelSelection(config, targetKey)
  return <>
    {selection.target && <label className="block border-b border-current/10 px-3 py-2 text-sm">
      切换对象
      <select aria-label="模型切换对象" className="mt-1 w-full rounded border border-current/20 bg-inherit p-2"
        value={selection.key} disabled={submitting !== null} onChange={event => setTargetKey(event.target.value)}>
        <option value="director">导演</option>
        {config.actors?.map(actor => <option key={actor.assistantId} value={`actor:${actor.assistantId}`}>{actor.name}</option>)}
      </select>
    </label>}
    {selection.options.map(option => <button key={option.id} type="button" role="menuitemradio" aria-checked={option.selected}
      disabled={submitting !== null || option.status === 'inactive'} onClick={() => onSelect(option, selection.target)}
      className={cn('flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left disabled:opacity-70',
        option.selected ? overlay ? 'bg-white/10 text-stone-50' : 'bg-bg text-text' :
          overlay ? 'text-stone-300 hover:bg-white/8' : 'text-text-muted hover:bg-bg')}>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{submitting === option.id ? '正在切换...' : option.label}</span>
        <span className="mt-0.5 block truncate text-xs opacity-75">{option.providerName || option.provider}/{option.modelID}</span>
      </span>
      {option.selected && <span className="text-xs opacity-70">当前</span>}
    </button>)}
  </>
}
