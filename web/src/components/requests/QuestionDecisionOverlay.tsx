import { useEffect, useId, useRef } from 'react'
import { motion } from 'motion/react'
import { cn } from '../../lib/utils'
import { QuestionForm } from './QuestionForm'
import type { QuestionAnswerActions } from './useQuestionDraft'

interface QuestionDecisionOverlayProps extends QuestionAnswerActions { fillWindow?: boolean }

export function QuestionDecisionOverlay({ fillWindow = false, ...actions }: QuestionDecisionOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleID = useId()
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLFormElement>('form')?.focus()
    return () => previousFocus?.focus()
  }, [actions.request.id])

  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), summary, [tabindex="0"]',
    ) ?? []).filter(node => node.getClientRects().length > 0)
    const first = focusable[0], last = focusable[focusable.length - 1]
    const initialFocus = document.activeElement === dialogRef.current || document.activeElement === dialogRef.current?.querySelector('form')
    if (event.shiftKey && (document.activeElement === first || initialFocus)) {
      event.preventDefault(); last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus()
    }
  }

  return <motion.div key={`question-backdrop-${actions.request.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
    className={cn('fixed inset-0 z-[90] flex items-center justify-center', fillWindow ? 'bg-card' : 'bg-scrim/65 p-4 backdrop-blur-[2px]')}>
    <motion.div ref={dialogRef} initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }} transition={{ duration: 0.2 }}
      role="dialog" aria-modal="true" aria-labelledby={titleID} tabIndex={-1} onKeyDown={trapFocus}
      className={cn('question-dialog', fillWindow && 'question-dialog-native')}>
      <span id={titleID} className="sr-only">问题确认，共 {actions.request.questions.length} 个问题</span>
      <QuestionForm key={actions.request.id} {...actions} modal />
    </motion.div>
  </motion.div>
}
