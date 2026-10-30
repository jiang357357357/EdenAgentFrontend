import { useEffect } from 'react'
import type { PendingQuestion } from '../types'
import { setDesktopQuestionWindowVisible } from '../lib/desktop-window'

/** The primary renderer stays awake and owns native visibility; the hidden decision renderer never hides itself. */
export function useQuestionWindowVisibility(questions: PendingQuestion[], owner: boolean, enabled: boolean) {
  const key = questions.map(question => question.id).join('|')
  useEffect(() => {
    if (!owner || !window.edenAgentDesktop) return
    void setDesktopQuestionWindowVisible(enabled && key.length > 0)
  }, [key, owner, enabled])
  useEffect(() => () => {
    if (owner && window.edenAgentDesktop) void setDesktopQuestionWindowVisible(false)
  }, [owner])
}
