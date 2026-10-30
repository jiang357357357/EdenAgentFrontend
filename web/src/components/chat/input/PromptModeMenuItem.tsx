import { LoaderCircle, Sparkles } from 'lucide-react'
import { usePromptMode } from '../../../lib/use-prompt-mode'
import { cn } from '../../../lib/utils'

export function PromptModeMenuItem({ overlay }: { overlay: boolean }) {
  const mode = usePromptMode()
  const enabled = mode.saved.enabled
  return (
    <section className="border-t border-current/15" aria-label="超限模式设置">
      <button type="button" role="menuitemcheckbox" aria-label="超限模式" aria-checked={enabled}
        disabled={!mode.ready || mode.saving} onClick={() => void mode.save(!enabled)}
        className={cn('flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors disabled:cursor-wait disabled:opacity-70',
          enabled ? 'bg-accent/10 text-accent' : overlay ? 'text-text hover:bg-highlight/8' : 'text-text-muted hover:bg-bg hover:text-text')}>
        {mode.saving ? <LoaderCircle aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin" />
          : <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">超限模式</span>
          <span className="mt-0.5 block text-xs opacity-75">使用内置提示词，下一轮提交生效</span>
        </span>
        <span aria-hidden="true" className={cn('mt-0.5 inline-flex h-4 w-7 flex-shrink-0 items-center rounded-full p-0.5', enabled ? 'bg-accent' : 'bg-current/20')}>
          <span className={cn('h-3 w-3 rounded-full bg-card transition-transform', enabled ? 'translate-x-3' : 'translate-x-0')} />
        </span>
      </button>
      <p role="status" aria-live="polite" className="sr-only">{!mode.ready ? mode.error ? '超限模式读取失败' : '正在读取超限模式' : mode.saving ? '正在保存超限模式' : enabled ? '超限模式已开启' : '超限模式已关闭'}</p>
      {mode.error && <div className="px-3 pb-2 text-xs">
        <p role="alert" className="break-words text-danger">{mode.error}</p>
        <button type="button" className="mt-1 underline" disabled={mode.saving} onClick={mode.reload}>重新读取超限模式</button>
      </div>}
    </section>
  )
}
