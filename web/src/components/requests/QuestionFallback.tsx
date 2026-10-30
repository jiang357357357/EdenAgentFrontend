import { useState } from 'react'
import type { PendingQuestion } from '../../types'
import { QuestionDecisionOverlay } from './QuestionDecisionOverlay'
import { NoticeCard, noticeActionClass } from '../feedback'

type Props = {
  request: PendingQuestion; count: number
  onOpenWindow: () => Promise<boolean>
  onReply: (id: string, answers: string[][], supplementary?: string[]) => Promise<void>
  onReject: (id: string) => Promise<void>
}

/** A desktop decision remains answerable even when its separate renderer cannot load. */
export function QuestionFallback({ request, count, onOpenWindow, onReply, onReject }: Props) {
  const [inline, setInline] = useState(false)
  const [error, setError] = useState('')
  return <>
    <div className="fixed bottom-4 left-1/2 z-[80] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2">
      <NoticeCard title="智能体正在等待你的回答" description={request.questions[0]?.question}
        badge={count > 1 ? `${count} 个待答问题` : undefined}
        actions={<>
          <button type="button" className={noticeActionClass} onClick={() => void onOpenWindow().then(opened => {
            if (!opened) setError('独立问题窗口未能打开，可以直接在此回答。')
          }).catch(() => setError('独立问题窗口未能打开，可以直接在此回答。'))}>打开问题窗口</button>
          <button type="button" className={noticeActionClass} onClick={() => setInline(true)}>在此回答</button>
        </>} />
      {error && <p role="alert" className="mt-1 rounded-lg bg-card px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
    {inline && <QuestionDecisionOverlay request={request} onReply={onReply} onReject={onReject} />}
  </>
}
