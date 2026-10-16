import { ChevronUp, X } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import type { SelfAwakeUsage } from '../../lib/self-awake-metrics'
import { formatTokenCount } from '../../lib/token-usage'

interface Props {
  duration: string
  usage: SelfAwakeUsage
  reading: boolean
  error: string
  cardClassName: string
}
type Metric = 'duration' | 'tokens'
const durationNote = '从本次自醒派发到完成，包含执行排队、模型初始化和工具调用。'

function useMetricsPopoverPosition(open: Metric | null, anchorRef: RefObject<HTMLButtonElement | null>,
  panel: RefObject<HTMLDivElement | null>, setOpen: Dispatch<SetStateAction<Metric | null>>) {
  const [position, setPosition] = useState<{ left: number; bottom: number; width: number; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const place = () => {
      if (!anchor) return
      const rect = anchor.getBoundingClientRect(), width = Math.min(344, window.innerWidth - 24)
      setPosition({ left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        bottom: window.innerHeight - rect.top + 8, width, maxHeight: Math.max(0, rect.top - 20) })
    }
    const outside = (event: Event) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !anchor?.contains(target)) setOpen(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(null); anchor?.focus({ preventScroll: true }) }
    }
    place()
    panel.current?.focus({ preventScroll: true })
    window.addEventListener('pointerdown', outside)
    window.addEventListener('focusin', outside)
    window.addEventListener('keydown', escape)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('focusin', outside)
      window.removeEventListener('keydown', escape)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef, panel, setOpen])
  return position
}

function MetricsDetails({ duration, usage, reading, error, tokenValue, titleId, onClose }:
  Omit<Props, 'cardClassName'> & { tokenValue: string; titleId: string; onClose: () => void }) {
  const available = !reading && !error
  const known = (value: number | null) => available && value !== null ? formatTokenCount(value) : '未知'
  const notice = reading ? '正在读取本次自醒的模型用量。' : error ? `用量读取失败，请点击顶部刷新重试。${error}`
    : usage.complete ? '本次自醒全部模型请求的累计用量，包含缓存。' : '部分模型请求缺少用量，完整总量未知；仅显示已记录部分。'
  return <>
    <div className="mb-3 flex items-center justify-between gap-4">
      <h3 id={titleId} className="font-medium">本次自醒统计</h3>
      <button type="button" aria-label="关闭自醒统计" onClick={onClose} className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text"><X aria-hidden="true" className="h-4 w-4" /></button>
    </div>
    <dl className="space-y-2.5">
      <div className="flex justify-between gap-4"><dt className="text-text-muted">耗时</dt><dd className="tabular-nums">{duration}</dd></div>
      <div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-text-muted">Token 合计</dt><dd className="font-medium tabular-nums text-accent">{tokenValue}</dd></div>
      {([
        ['输入（非缓存）', usage.input], ['输出', usage.output],
        ['缓存读取', usage.cacheRead],
      ] as const).map(([label, count]) => <div key={label} className="flex justify-between gap-4"><dt className="text-text-muted">{label}</dt><dd className="tabular-nums">{known(count)}</dd></div>)}
    </dl>
    <p role={error ? 'alert' : undefined} className={`mt-3 break-words text-xs leading-relaxed ${error ? 'text-danger' : 'text-text-muted'}`}>{notice}</p>
    <p className="mt-2 text-xs leading-relaxed text-text-muted">{durationNote}思考用量已计入输出。</p>
  </>
}

export function SelfAwakeMetricsPopover({ duration, usage, reading, error, cardClassName }: Props) {
  const id = useId()
  const [open, setOpen] = useState<Metric | null>(null)
  const durationButton = useRef<HTMLButtonElement>(null), tokenButton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const anchor = open === 'duration' ? durationButton : tokenButton
  const position = useMetricsPopoverPosition(open, anchor, panel, setOpen)
  const close = () => { setOpen(null); anchor.current?.focus({ preventScroll: true }) }
  const known = (value: number | null) => value === null ? '未知' : formatTokenCount(value)
  const tokenValue = reading ? '读取中…' : error ? '未知' : usage.complete ? known(usage.total)
    : usage.recorded !== null ? `至少 ${known(usage.recorded)}` : '未知'
  const buttonClass = `${cardClassName} flex items-center transition-colors hover:border-accent/50 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`
  return <>
    <button ref={durationButton} type="button" className={buttonClass} aria-haspopup="dialog"
      aria-expanded={open === 'duration'} aria-controls={open === 'duration' ? id : undefined}
      aria-label={`本次自醒耗时：${duration}，查看明细`} onClick={() => setOpen(value => value === 'duration' ? null : 'duration')}>
      <span className="mr-[0.65vw] text-text-muted">耗时</span><span className="tabular-nums text-text">{duration}</span>
      <ChevronUp aria-hidden="true" className={`ml-2 h-3.5 w-3.5 text-text-muted transition-transform ${open === 'duration' ? 'rotate-180' : ''}`} />
    </button>
    <button ref={tokenButton} type="button" className={buttonClass} aria-haspopup="dialog"
      aria-expanded={open === 'tokens'} aria-controls={open === 'tokens' ? id : undefined}
      aria-label={`本轮 Token 用量：${tokenValue}，查看明细`} onClick={() => setOpen(value => value === 'tokens' ? null : 'tokens')}>
      <span className="mr-[0.65vw] text-text-muted">Token</span><span className="tabular-nums text-text">{tokenValue}</span>
      <ChevronUp aria-hidden="true" className={`ml-2 h-3.5 w-3.5 text-text-muted transition-transform ${open === 'tokens' ? 'rotate-180' : ''}`} />
    </button>
    {open && createPortal(<div ref={panel} id={id} role="dialog" aria-labelledby={`${id}-title`} tabIndex={-1}
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
      className="fixed z-[100] overflow-y-auto rounded-xl border border-border bg-card p-4 text-sm text-text shadow-xl outline-none">
      <MetricsDetails duration={duration} usage={usage} reading={reading} error={error} tokenValue={tokenValue} titleId={`${id}-title`} onClose={close} />
    </div>, document.body)}
  </>
}
