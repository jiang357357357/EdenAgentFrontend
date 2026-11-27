import { useState } from 'react'
import type { PendingQuestion } from '../../types'

export interface QuestionAnswerActions {
  request: PendingQuestion
  onReply: (requestID: string, answers: string[][], supplementary?: string[]) => Promise<void>
  onReject: (requestID: string) => Promise<void>
}

/** Mounted once per request ID by QuestionForm; no draft is shared across requests. */
export function useQuestionDraft({ request, onReply, onReject }: QuestionAnswerActions) {
  const [selected, setSelected] = useState<Record<number, string[]>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState<'reply' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const answers = request.questions.map((_, index) => selected[index] ?? [])
  const supplementary = request.questions.map((item, index) => item.custom !== false ? custom[index]?.trim() ?? '' : '')
  const completed = answers.map((answer, index) => answer.length > 0 || Boolean(supplementary[index]))
  const answered = completed.filter(Boolean).length
  const remaining = completed.length - answered
  const canSubmit = completed.length > 0 && remaining === 0

  function toggleOption(index: number, label: string, multiple = false) {
    if (submitting) return
    setSelected(current => {
      const picked = current[index] ?? []
      const next = picked.includes(label) ? picked.filter(value => value !== label) : multiple ? [...picked, label] : [label]
      return { ...current, [index]: next }
    })
  }

  function updateCustom(index: number, value: string) {
    if (!submitting) setCustom(current => ({ ...current, [index]: value }))
  }

  async function submit() {
    if (submitting || !canSubmit) return
    setSubmitting('reply')
    setError(null)
    try {
      await onReply(request.id, answers, supplementary)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      setSubmitting(null)
    }
  }

  async function reject() {
    if (submitting) return
    setSubmitting('reject')
    setError(null)
    try {
      await onReject(request.id)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      setSubmitting(null)
    }
  }

  return { answers, custom, completed, answered, remaining, canSubmit, submitting, error, toggleOption, updateCustom, submit, reject }
}
