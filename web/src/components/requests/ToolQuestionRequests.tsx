import { useState } from 'react'
import type { PendingQuestion } from '../../types'
import type { QuestionActions } from './QuestionToolContext'
import { QuestionRequestCard } from './QuestionRequestCard'
import { noticeActionClass } from '../feedback'

export function ToolQuestionRequests({ requests, onQuestionReply, onQuestionReject, onOpenQuestionWindow }: QuestionActions & { requests: PendingQuestion[] }) {
  const [error, setError] = useState('')
  if (!requests.length) return null
  return <section aria-label="待答问题" className="border-t border-border">
    {onOpenQuestionWindow && <div className="px-3 pt-3">
      <button type="button" className={noticeActionClass} onClick={() => {
        setError('')
        void onOpenQuestionWindow().then(opened => {
          if (!opened) setError('独立问题窗口暂不可用，可直接在工具卡中回答。')
        }).catch(() => setError('独立问题窗口暂不可用，可直接在工具卡中回答。'))
      }}>打开问题窗口</button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>}
    {onQuestionReply && onQuestionReject ? requests.map(request => <QuestionRequestCard key={request.id} request={request}
      onReply={onQuestionReply} onReject={onQuestionReject} embedded />) : <p role="status" className="p-3 text-sm text-text-muted">回答入口尚未就绪，请刷新会话。</p>}
  </section>
}
