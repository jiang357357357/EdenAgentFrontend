import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QuestionDecisionOverlay } from '../../src/components/requests/QuestionDecisionOverlay'
import { QuestionFallback } from '../../src/components/requests/QuestionFallback'
import { QuestionWindowStatus } from '../../src/components/requests/QuestionWindowStatus'
import { useQuestionWindowVisibility } from '../../src/hooks/useQuestionWindowVisibility'
import { setDesktopQuestionWindowVisible } from '../../src/lib/desktop-window'
import { DesktopRendererReady } from '../../src/components/desktop/DesktopRendererReady'
import type { PendingQuestion } from '../../src/types'

declare global { interface Window {
  fixtureReady: boolean
  deliverQuestion(id?: string): void
  failQuestionSync(): void
  questionFixture: { request(command: string, args?: unknown): Promise<unknown>; onAnswered(callback: (id: string) => void): () => void }
} }
const role = new URLSearchParams(location.search).get('role') ?? 'main'
const sample = (id = 'decision') => ({ id, sessionID: 'A', questions: [{ header: '下一步', question: '需要按哪种方式继续任务？',
  options: [{ label: '继续', description: '完成当前步骤后再执行后续任务' }, { label: '停止', description: '保留当前进度' }], custom: true }] })

function Fixture() {
  const [questions, setQuestions] = useState<PendingQuestion[]>([])
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  useQuestionWindowVisibility(questions, role === 'main', true)
  useEffect(() => {
    window.deliverQuestion = id => { setQuestions([sample(id)]); setError(undefined) }
    window.failQuestionSync = () => { setQuestions([]); setError('临时同步失败，请重试') }
    const dispose = window.questionFixture.onAnswered(id => setQuestions(values => values.filter(value => value.id !== id)))
    window.fixtureReady = true
    return dispose
  }, [])
  const reply = async (requestID: string, answers: string[][], supplementary?: string[]) => {
    await window.questionFixture.request('reply', { requestID, answers, supplementary })
    setQuestions(values => values.filter(value => value.id !== requestID))
  }
  const reject = async (requestID: string) => { await window.questionFixture.request('reject', { requestID }); setQuestions([]) }
  if (role === 'main') return <>
    <DesktopRendererReady />
    <p className="p-8 text-text-muted">隐藏的主窗口 · 独立提问窗口故障时仍能回答</p>
    {questions[0] && <QuestionFallback key={questions[0].id} request={questions[0]} count={questions.length}
      onOpenWindow={() => setDesktopQuestionWindowVisible(true)} onReply={reply} onReject={reject} />}
  </>
  return questions[0] ? <QuestionDecisionOverlay request={questions[0]} onReply={reply} onReject={reject} fillWindow /> :
    <QuestionWindowStatus error={error} loading={loading} onRefresh={() => {
      setLoading(true)
      void window.questionFixture.request('refresh').then(() => { setQuestions([sample()]); setError(undefined) }).finally(() => setLoading(false))
    }} />
}
createRoot(document.getElementById('root')!).render(<Fixture />)
