import { CheckCircle2, Circle, Plus } from 'lucide-react'
import type { PendingQuestion } from '../../types'
import { cn } from '../../lib/utils'

interface QuestionSectionProps {
  item: PendingQuestion['questions'][number]
  index: number
  total: number
  id: string
  picked: string[]
  custom: string
  completed: boolean
  active: boolean
  disabled: boolean
  onActivate: () => void
  onToggle: (label: string) => void
  onCustom: (value: string) => void
  sectionRef: (node: HTMLElement | null) => void
}

export function QuestionSection({ item, index, total, id, picked, custom, completed, active, disabled,
  onActivate, onToggle, onCustom, sectionRef }: QuestionSectionProps) {
  function moveRadio(event: React.KeyboardEvent<HTMLButtonElement>, optionIndex: number) {
    if (item.multiple || !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const count = item.options.length
    const offset = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (optionIndex + offset + count) % count
    const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]
    target?.focus()
    if (!picked.includes(item.options[next].label)) onToggle(item.options[next].label)
  }

  return <section ref={sectionRef} id={id} tabIndex={-1} aria-labelledby={`${id}-title`}
    data-question-index={index} onFocusCapture={onActivate}
    className={cn('question-section', active && 'question-section-current')}>
    <div className="question-section-meta">
      <span className="question-section-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <span className="question-section-counter">第 {index + 1} 题 / 共 {total} 题</span>
      <span className="question-kind">{item.options.length === 0 ? '自由回答' : item.multiple ? '多选' : '单选'}</span>
      <span className={cn('question-section-state', completed ? 'text-success' : 'text-text-muted')}>
        {completed ? <CheckCircle2 size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
        {completed ? '已填写' : '待回答'}
      </span>
    </div>
    {item.header && <p className="question-section-label">{item.header}</p>}
    <h3 id={`${id}-title`} className="question-section-title">{item.question}</h3>
    {item.options.length > 0 && <>
      <p className="question-section-hint">{item.multiple ? '可同时选择多项' : '选择一项，再次点击可取消'}</p>
      <div className="question-options" role={item.multiple ? 'group' : 'radiogroup'} aria-labelledby={`${id}-title`}>
        {item.options.map((option, optionIndex) => {
          const checked = picked.includes(option.label)
          return <button key={option.label} type="button" role={item.multiple ? 'checkbox' : 'radio'}
            aria-checked={checked} aria-label={option.label}
            aria-describedby={option.description ? `${id}-option-${optionIndex}` : undefined}
            tabIndex={!item.multiple && (picked.length ? !checked : optionIndex !== 0) ? -1 : 0}
            disabled={disabled} className={cn('question-option', checked && 'question-option-selected')}
            onClick={() => onToggle(option.label)} onKeyDown={event => moveRadio(event, optionIndex)}>
            <span className={cn('question-option-control', item.multiple && 'question-option-checkbox', checked && 'question-option-checked')} aria-hidden="true">
              {checked && (item.multiple ? '✓' : <span />)}
            </span>
            <span className="question-option-copy"><span className="question-option-label">{option.label}</span>
              {option.description && <span id={`${id}-option-${optionIndex}`} className="question-option-description">{option.description}</span>}
            </span>
          </button>
        })}
      </div>
    </>}
    {item.custom !== false && <details className="question-custom" open={item.options.length === 0 ? true : undefined}>
      <summary><Plus size={14} aria-hidden="true" />{item.options.length ? '补充说明 / 自行回答' : '填写回答'}
        <span className="text-text-muted">{custom.trim() ? '已填写' : item.options.length ? '（可选）' : ''}</span>
      </summary>
      <label className="question-custom-label" htmlFor={`${id}-custom`}>自定义回答</label>
      <textarea id={`${id}-custom`} value={custom} maxLength={4000} disabled={disabled} rows={2}
        placeholder="可以补充说明，也可以直接在这里回答。" onChange={event => onCustom(event.currentTarget.value)} />
    </details>}
  </section>
}
