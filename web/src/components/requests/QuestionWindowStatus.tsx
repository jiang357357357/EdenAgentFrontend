import { NoticeCard, noticeActionClass } from '../feedback'

export function QuestionWindowStatus({ loading, error, onRefresh }: { loading: boolean; error?: string; onRefresh: () => void }) {
  return <div className="flex min-h-screen items-center justify-center bg-bg p-6">
    <NoticeCard title={error ? '待答问题同步失败' : loading ? '正在同步待答问题…' : '暂无待答问题'}
      tone={error ? 'error' : 'info'} busy={loading}
      description={error || '收到新问题后会在这里显示，也可在主窗口直接回答。'}
      actions={<button type="button" className={noticeActionClass} disabled={loading} onClick={onRefresh}>重新同步</button>} />
  </div>
}
