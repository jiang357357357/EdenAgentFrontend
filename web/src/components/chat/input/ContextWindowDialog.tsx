import { useEffect, useId, useState } from 'react'
import { SessionPanelDialog } from '../SessionPanelDialog'
import { ContextContentDialog } from './ContextContentDialog'
import type { useContextLimit } from './hooks/useContextLimit'

type Props = ReturnType<typeof useContextLimit> & {
  sessionId?: string; draft: string; contextTokens: number; isRunning: boolean; onClose: () => void
}
const count = (value: number) => value.toLocaleString('zh-CN')
const presets = [16_384, 32_768, 65_536, 131_072, 262_144, 524_288, 1_048_576]

export function ContextWindowDialog({ sessionId, draft, contextTokens, isRunning, onClose, info, loading, saving, error, reload, save }: Props) {
  const [value, setValue] = useState('')
  const [showContent, setShowContent] = useState(false)
  const inputId = useId()
  useEffect(() => { if (info) setValue(String(info.contextWindow)) }, [info])
  const limit = Number(value)
  const valid = Boolean(info && value.trim() && Number.isSafeInteger(limit) && limit >= info.minContextWindow && limit <= info.defaultContextWindow)
  const inputBudget = info ? Math.max(0, limit - info.maxOutputTokens - Math.max(512, Math.ceil(limit * 0.05))) : 0
  const disabled = loading || saving || isRunning || !info
  const submit = async (next: number | null) => { if (await save(next)) onClose() }
  if (showContent) return <ContextContentDialog sessionId={sessionId} draft={draft} onClose={() => setShowContent(false)} />
  return <SessionPanelDialog title="上下文上限" onClose={onClose} dismissible={!saving}>
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (valid && !disabled) void submit(limit) }}>
      <p className="text-text-muted">调整当前会话的上下文预算。后续请求按此上限自动压缩；多角色会话同时应用到各角色及导演。</p>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-bg p-4">
        <span className="text-text-muted">当前上下文（估算）</span>
        <strong className="text-lg tabular-nums">{count(contextTokens)} <span className="text-xs font-normal text-text-muted">tokens</span></strong>
      </div>
      {loading && <p role="status" className="text-text-muted">正在读取设置…</p>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 text-danger"><span>{error}</span><button type="button" disabled={loading || saving} onClick={reload} className="shrink-0 underline">重新读取</button></div>}
      {!sessionId && <p className="text-text-muted">创建会话后即可调整上限。</p>}
      {info && <>
        <div className="space-y-3">
          <label htmlFor={inputId} className="block font-medium">上下文上限 <span className="font-normal text-text-muted">（tokens）</span></label>
          <input id={inputId} type="number" inputMode="numeric" step="1" min={info.minContextWindow} max={info.defaultContextWindow}
            value={value} disabled={disabled} onChange={event => setValue(event.target.value)} aria-describedby={`${inputId}-range`}
            className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-lg tabular-nums outline-none focus:border-accent disabled:opacity-50" />
          <p id={`${inputId}-range`} className="text-xs text-text-muted">可调范围 {count(info.minContextWindow)}–{count(info.defaultContextWindow)}；模型默认 {count(info.defaultContextWindow)}。</p>
          <div className="flex flex-wrap gap-2">
            {presets.filter(preset => preset >= info.minContextWindow && preset <= info.defaultContextWindow).map(preset =>
              <button key={preset} type="button" disabled={disabled} aria-pressed={limit === preset} onClick={() => setValue(String(preset))}
                className={`rounded-lg border px-3 py-1.5 disabled:opacity-50 ${limit === preset ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-bg'}`}>{preset / 1024}K</button>)}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-text-muted">{valid ? `预留回复及安全余量后，输入预算约 ${count(inputBudget)} tokens。` : '请输入范围内的整数。'} 设置仅保存在当前会话中，模型能力上限仍以服务配置为准。</p>
        {valid && contextTokens > inputBudget && <p role="status" className="text-warning">当前内容超过新的输入预算，下一次请求可能触发自动压缩。</p>}
        {isRunning && <p role="status" className="text-warning">当前正在回答，结束后即可保存设置。</p>}
      </>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button type="button" onClick={() => setShowContent(true)} disabled={saving} className="text-accent hover:underline disabled:opacity-50">查看上下文内容</button>
        <div className="flex gap-2">
          <button type="button" disabled={disabled || info?.override == null} onClick={() => void submit(null)} className="rounded-lg border border-border px-4 py-2 hover:bg-bg disabled:opacity-40">恢复默认</button>
          <button type="submit" disabled={disabled || !valid} className="rounded-lg bg-accent px-5 py-2 text-on-accent hover:bg-accent-hover disabled:opacity-40">{saving ? '保存中…' : '保存'}</button>
        </div>
      </div>
    </form>
  </SessionPanelDialog>
}
