import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { PendingQuestion } from '../../types'
import { questionMatchesTool } from '../../lib/question-tool-state'

export type QuestionActions = {
  onQuestionReply?: (id: string, answers: string[][], supplementary?: string[]) => Promise<void>
  onQuestionReject?: (id: string) => Promise<void>
  onOpenQuestionWindow?: () => Promise<boolean>
}
type QuestionScope = QuestionActions & { sessionID: string; requests: PendingQuestion[] }
const QuestionContext = createContext<QuestionScope | null>(null)

export function QuestionToolProvider({ children, ...scope }: QuestionScope & { children: ReactNode }) {
  const { sessionID, requests, onQuestionReply, onQuestionReject, onOpenQuestionWindow } = scope
  const value = useMemo(() => ({ sessionID, requests, onQuestionReply, onQuestionReject, onOpenQuestionWindow }),
    [sessionID, requests, onQuestionReply, onQuestionReject, onOpenQuestionWindow])
  return <QuestionContext.Provider value={value}>{children}</QuestionContext.Provider>
}

export function useToolQuestions(toolID: string, messageID?: string, turnID?: string) {
  const scope = useContext(QuestionContext)
  return { ...scope, requests: scope?.requests.filter(request => questionMatchesTool(request, scope.sessionID, toolID, messageID, turnID)) ?? [] }
}
