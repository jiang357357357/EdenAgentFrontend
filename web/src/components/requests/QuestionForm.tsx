import { useId, useRef, useState } from 'react'
import { NoticeCard, noticeActionClass } from '../feedback'
import { cn } from '../../lib/utils'
import { QuestionProgress } from './QuestionProgress'
import { QuestionSection } from './QuestionSection'
import { useQuestionDraft, type QuestionAnswerActions } from './useQuestionDraft'

interface QuestionFormProps extends QuestionAnswerActions { modal?: boolean }

/** Callers key this component by request.id so a new request always starts with an empty draft. */
export function QuestionForm({ modal = false, ...actions }: QuestionFormProps) {
  const draft = useQuestionDraft(actions)
  const [active, setActive] = useState(0)
  const prefix = useId()
  const bodyRef = useRef<HTMLDivElement>(null)
  const sections = useRef<(HTMLElement | null)[]>([])
  const sectionID = (index: number) => `${prefix}-question-${index}`
  const titleID = `${prefix}-title`
  const total = actions.request.questions.length

  function navigate(index: number) {
    const section = sections.current[index]
    if (!section) return
    setActive(index)
    if (modal && bodyRef.current) {
      const body = bodyRef.current
      body.scrollTo({ top: body.scrollTop + section.getBoundingClientRect().top - body.getBoundingClientRect().top, behavior: 'instant' })
    } else section.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    section.focus({ preventScroll: true })
  }

  function updateVisibleQuestion() {
    const body = bodyRef.current
    if (!modal || !body) return
    const top = body.getBoundingClientRect().top
    const focused = sections.current.findIndex(section => section?.contains(document.activeElement))
    const current = sections.current[focused]?.getBoundingClientRect()
    if (current && current.bottom > top && current.top < body.getBoundingClientRect().bottom) {
      setActive(focused)
      return
    }
    const visible = sections.current.findIndex(section => section && section.getBoundingClientRect().bottom > top + 12)
    if (visible >= 0) setActive(visible)
  }

  return <form className={cn('question-form', modal && 'question-form-modal')} aria-labelledby={titleID} tabIndex={modal ? -1 : undefined}
    onSubmit={event => { event.preventDefault(); void draft.submit() }}
    onKeyDown={event => {
      if (modal && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void draft.reject() }
    }}>
    <QuestionProgress titleID={titleID} sectionID={sectionID} completed={draft.completed} active={active} onNavigate={navigate} />
    <div ref={bodyRef} className="question-form-body" onScroll={updateVisibleQuestion}>
      {actions.request.questions.map((item, index) => <QuestionSection key={`${actions.request.id}-${index}`}
        item={item} index={index} total={total} id={sectionID(index)}
        picked={draft.answers[index]} custom={draft.custom[index] ?? ''} completed={draft.completed[index]}
        active={active === index} disabled={draft.submitting !== null} onActivate={() => setActive(index)}
        sectionRef={node => { sections.current[index] = node }}
        onToggle={label => draft.toggleOption(index, label, item.multiple)} onCustom={value => draft.updateCustom(index, value)} />)}
    </div>
    <footer className="question-form-footer">
      {draft.error && <NoticeCard tone="error" title="问题答复失败" description={draft.error} className="question-form-error" />}
      <div className="question-form-actions">
        <div className="question-form-completion"><p>已填写 {draft.answered} / {total} 题</p>
          <span>{draft.remaining ? '完成后统一提交' : '已填写完成，等待提交'}</span>
        </div>
        <button type="button" className={cn(noticeActionClass, 'question-form-defer')} disabled={draft.submitting !== null}
          aria-busy={draft.submitting === 'reject'} onClick={() => void draft.reject()}>
          {draft.submitting === 'reject' ? '正在处理…' : '暂不处理'}
        </button>
        <button type="submit" className={cn(noticeActionClass, 'question-form-submit')}
          disabled={!draft.canSubmit || draft.submitting !== null} aria-busy={draft.submitting === 'reply'}>
          {draft.submitting === 'reply' ? '正在提交…' : draft.remaining ? `还需回答 ${draft.remaining} 个问题` : modal ? '确认选择' : '提交回答'}
        </button>
      </div>
    </footer>
  </form>
}
