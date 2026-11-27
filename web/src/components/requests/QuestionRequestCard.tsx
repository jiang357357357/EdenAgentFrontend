import { cn } from '../../lib/utils'
import { noticeSurface } from '../feedback'
import { QuestionForm } from './QuestionForm'
import type { QuestionAnswerActions } from './useQuestionDraft'

interface QuestionRequestCardProps extends QuestionAnswerActions {
  tone?: 'default' | 'overlay'
  embedded?: boolean
}

export function QuestionRequestCard({ tone = 'default', embedded = false, ...actions }: QuestionRequestCardProps) {
  return <div className={cn(!embedded && noticeSurface({ tone: 'neutral', variant: tone }), 'overflow-hidden bg-card')}>
    <QuestionForm key={actions.request.id} {...actions} />
  </div>
}
