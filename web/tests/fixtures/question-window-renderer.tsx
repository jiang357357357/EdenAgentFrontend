import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QuestionDecisionOverlay } from '../../src/components/requests/QuestionDecisionOverlay'
import { QuestionToolProvider } from '../../src/components/requests/QuestionToolContext'
import { ToolCard } from '../../src/components/chat/message/ToolCard'
import { QuestionWindowStatus } from '../../src/components/requests/QuestionWindowStatus'
import { useQuestionWindowVisibility } from '../../src/hooks/useQuestionWindowVisibility'
import { setDesktopQuestionWindowVisible } from '../../src/lib/desktop-window'
import { DesktopRendererReady } from '../../src/components/desktop/DesktopRendererReady'
import type { PendingQuestion, ToolCall } from '../../src/types'

declare global { interface Window {
  fixtureReady: boolean
  deliverQuestion(id?: string): void
  failQuestionSync(): void
  questionFixture: { request(command: string, args?: unknown): Promise<unknown>; onAnswered(callback: (id: string, answers?: string[][]) => void): () => void }
} }
const role = new URLSearchParams(location.search).get('role') ?? 'main'
const sample = (id = 'decision') => ({ id, sessionID: 'A', turnID: 'turn-A', toolCallID: `call-${id}`, questions: [{ header: '下一步', question: '需要按哪种方式继续任务？',
  options: [{ label: '继续', description: '完成当前步骤后再执行后续任务' }, { label: '停止', description: '保留当前进度' }], custom: true }] })

function Fixture() {
  const [questions, setQuestions] = useState<PendingQuestion[]>([])
  const [tool, setTool] = useState<ToolCall>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  useQuestionWindowVisibility(questions, role === 'main', true)
  useEffect(() => {
    window.deliverQuestion = id => {
      const question = sample(id)
      setQuestions([question]); setError(undefined)
      setTool({ id: question.toolCallID, name: 'request_user_input', status: 'running', input: JSON.stringify({ questions: question.questions }) })
    }
    window.failQuestionSync = () => { setQuestions([]); setError('临时同步失败，请重试') }
    const dispose = window.questionFixture.onAnswered((id, answers) => {
      setQuestions(values => values.filter(value => value.id !== id))
      setTool(value => value?.id === `call-${id}` ? { ...value, status: answers ? 'success' : 'error', output: answers ? JSON.stringify({ answers }) : undefined } : value)
    })
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
    <p className="p-8 text-text-muted">隐藏的主窗口 · 待答问题在对应工具中直接回答</p>
    <QuestionToolProvider sessionID="A" requests={questions} onQuestionReply={reply} onQuestionReject={reject}
      onOpenQuestionWindow={() => setDesktopQuestionWindowVisible(true)}>
      {tool && <ToolCard tool={tool} messageID="fixture-message" turnID="turn-A" />}
      <ToolCard tool={{ id: 'unrelated-call', name: 'read_file', status: 'success', input: '{}' }} />
    </QuestionToolProvider>
  </>
  return questions[0] ? <QuestionDecisionOverlay request={questions[0]} onReply={reply} onReject={reject} fillWindow /> :
    <QuestionWindowStatus error={error} loading={loading} onRefresh={() => {
      setLoading(true)
      void window.questionFixture.request('refresh').then(() => { setQuestions([sample()]); setError(undefined) }).finally(() => setLoading(false))
    }} />
}
createRoot(document.getElementById('root')!).render(<Fixture />)
