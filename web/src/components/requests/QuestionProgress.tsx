import { CheckCircle2, Circle, HelpCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface QuestionProgressProps {
  titleID: string
  sectionID: (index: number) => string
  completed: boolean[]
  active: number
  onNavigate: (index: number) => void
}

export function QuestionProgress({ titleID, sectionID, completed, active, onNavigate }: QuestionProgressProps) {
  const total = completed.length
  const answered = completed.filter(Boolean).length
  return <header className="question-form-header">
    <p className="question-form-eyebrow"><HelpCircle size={15} aria-hidden="true" />等待你的回答</p>
    <h2 id={titleID} className="question-form-title">这次有 <strong>{total}</strong> 个问题需要确认</h2>
    <p className="question-form-description">每道题分别作答，完成后统一提交。</p>
    <div className="question-progress-line">
      <span aria-live="polite" aria-atomic="true">已填写 {answered} / {total}</span>
      <div className="question-progress-track" role="progressbar" aria-label="问题填写进度"
        aria-valuenow={answered} aria-valuemin={0} aria-valuemax={total}>
        <div className="question-progress-fill" style={{ width: `${total ? answered / total * 100 : 0}%` }} />
      </div>
      <span className="text-text-muted">{answered === total ? '待统一提交' : `还有 ${total - answered} 个问题`}</span>
    </div>
    <nav className="question-navigation" aria-label={`本次共 ${total} 个问题`}>
      {completed.map((done, index) => <button key={index} type="button"
        className={cn('question-navigation-item', active === index && 'question-navigation-current')}
        aria-current={active === index ? 'step' : undefined} aria-controls={sectionID(index)}
        aria-label={`前往第 ${index + 1} 题，${done ? '已填写' : '待回答'}`} onClick={() => onNavigate(index)}>
        <span className="question-navigation-number">第 {index + 1} 题</span>
        {done ? <CheckCircle2 size={15} className="text-success" aria-hidden="true" /> :
          <Circle size={15} className={active === index ? 'fill-accent text-accent' : 'text-text-lighter'} aria-hidden="true" />}
        <span className={done ? 'text-success' : 'text-text-muted'}>{done ? '已填写' : '待回答'}</span>
      </button>)}
    </nav>
  </header>
}
