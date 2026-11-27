import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QuestionDecisionOverlay } from '../../src/components/requests/QuestionDecisionOverlay'
import { QuestionRequestCard } from '../../src/components/requests/QuestionRequestCard'
import type { PendingQuestion } from '../../src/types'

type Preview = { count: number; inline?: boolean; customOnly?: boolean; custom?: boolean; long?: boolean }
declare global { interface Window {
  questionDesign: {
    ready: boolean
    show: (options: Preview) => void
    failNext: boolean
    replies: { id: string; answers: string[][]; supplementary?: string[] }[]
    rejected: number
  }
} }
const questionItems = [
  { header: '修改范围', question: '这次修改应用到哪里？', options: [{ label: '仅当前会话', description: '' }, { label: '所有会话', description: '' }] },
  { header: '生效时间', question: '什么时候应用这次修改？', options: [{ label: '立即生效', description: '' }, { label: '下次启动', description: '' }] },
  { header: '结果反馈', question: '完成后，你希望看到哪些反馈？', multiple: true, options: [{ label: '修改摘要', description: '' }, { label: '测试结果', description: '' }] },
]
window.questionDesign = { ready: false, show: () => {}, failNext: false, replies: [], rejected: 0 }

function Preview() {
  const [request, setRequest] = useState<PendingQuestion>()
  const [inline, setInline] = useState(false)
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    let sequence = 0
    window.questionDesign.show = options => {
      setFinished(false)
      setInline(Boolean(options.inline))
      setRequest({ id: `preview-${++sequence}`, sessionID: 'synthetic-session', questions: questionItems.slice(0, options.count).map(item => ({
        ...item, custom: options.custom !== false,
        question: options.long ? `${item.question}\n${'这是一段用于确认长问题在窄窗口中也能完整显示的说明。'.repeat(4)}` : item.question,
        options: options.customOnly ? [] : item.options.map(option => ({ ...option,
          description: options.long ? '这是较长的选项说明，应自然换行，并且不覆盖相邻题目或窗口底部的操作按钮。'.repeat(2) : '' })),
      })) })
    }
    window.questionDesign.ready = true
  }, [])
  const onReply = async (id: string, answers: string[][], supplementary?: string[]) => {
    if (window.questionDesign.failNext) { window.questionDesign.failNext = false; throw new Error('本次提交失败，请重试') }
    window.questionDesign.replies.push({ id, answers, supplementary })
    setFinished(true); setRequest(undefined)
  }
  const onReject = async () => { window.questionDesign.rejected++; setRequest(undefined) }
  if (!request) return <p role="status">{finished ? '回答已提交' : '等待合成问题'}</p>
  return inline ? <main className="p-4"><QuestionRequestCard request={request} onReply={onReply} onReject={onReject} /></main> :
    <QuestionDecisionOverlay request={request} onReply={onReply} onReject={onReject} fillWindow />
}
createRoot(document.getElementById('root')!).render(<Preview />)
