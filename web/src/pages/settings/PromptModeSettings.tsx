import { LoaderCircle } from 'lucide-react'
import { usePromptMode } from '../../lib/use-prompt-mode'

export function PromptModeSettings() {
  const mode = usePromptMode()
  return (
    <section aria-labelledby="prompt-mode-title" className="border-t border-border px-2 py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 id="prompt-mode-title" className="text-sm font-medium text-text">超限模式</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">开启后自动使用内置提示词，为当前世界、当前账号的角色对话添加独立系统提示。保存后从下一轮提交生效，正在执行或已排队的回合保持原配置。</p>
        </div>
        <button type="button" role="switch" aria-label="超限模式" aria-checked={mode.value.enabled}
          disabled={!mode.ready || mode.saving} onClick={() => mode.change({ enabled: !mode.value.enabled })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${mode.value.enabled ? 'bg-accent' : 'bg-border'}`}>
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-card transition-transform ${mode.value.enabled ? 'left-1 translate-x-5' : 'left-1'}`} />
        </button>
      </div>
      <p className="mt-3 text-xs text-text-muted">提示词由应用内置，无需填写。此设置不改变工具审批权限。</p>
      {mode.error ? <p role="alert" className="mt-2 whitespace-pre-wrap break-words text-xs text-danger">{mode.error}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void mode.save()} disabled={!mode.ready || mode.saving || !mode.dirty}
          className="flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs text-on-accent disabled:opacity-50">
          {mode.saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}保存并应用
        </button>
        <button type="button" disabled={mode.saving} onClick={mode.reload} className="h-9 rounded-lg border border-border px-3 text-xs text-text-muted disabled:opacity-50">重新读取</button>
        <span aria-live="polite" className="text-xs text-text-muted">{!mode.ready ? '尚未读取配置' : mode.saving ? '正在保存…' : mode.dirty ? '有未保存修改' : mode.saved.enabled ? '已保存：开启' : '已保存：关闭'}</span>
      </div>
    </section>
  )
}
