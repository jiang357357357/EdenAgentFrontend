import { useEffect } from 'react'
import { NoticeCard, noticeActionClass } from '../feedback'
import type { ConnectionFeedbackState } from '../../lib/connection-feedback'

interface RuntimeNoticesProps {
  connection: ConnectionFeedbackState
  runtimeError?: string
  modelRetry?: { attempt: number; maxAttempts: number }
  onDismissConnection: () => void
  onRetrySync: () => void
  onSelectAssistant?: () => void
}

export function ConnectionNotice({ connection, onDismiss, onRetrySync }: {
  connection: ConnectionFeedbackState
  onDismiss: () => void
  onRetrySync: () => void
}) {
  useEffect(() => {
    if (connection.phase !== 'restored') return
    const timer = setTimeout(onDismiss, 6000)
    return () => clearTimeout(timer)
  }, [connection.phase, connection.revision, onDismiss])

  switch (connection.phase) {
    case 'connecting':
      return <NoticeCard title="正在连接服务" description="连接建立后会加载会话记录。" busy />
    case 'reconnecting':
      return <NoticeCard tone="warning" title={connection.hasConnected ? '此会话连接中断，正在重连' : '此会话暂时无法连接，正在重试'}
        description={connection.reason || '正在尝试重新连接 Eden Agent 服务。'} busy>
        <p className="text-xs leading-relaxed text-text-muted">已有消息仍可查看。此会话重连不会断开其他会话，也不会自动取消或重新执行任务。</p>
      </NoticeCard>
    case 'restoring':
      return <NoticeCard title="连接已建立，正在同步" description="正在读取会话记录和待处理请求，已有消息仍可查看。" busy />
    case 'restored':
      return <NoticeCard tone="success" title="连接已恢复" description="会话状态已重新读取，可以继续操作。" onDismiss={onDismiss} />
    case 'sync-error':
      return <NoticeCard tone="warning" title="连接已恢复，部分内容同步失败" description="已有消息仍可查看，请重新同步后核对任务状态。"
        details={connection.reason} actions={<button type="button" className={noticeActionClass} onClick={onRetrySync}>重新同步</button>} />
    default:
      return null
  }
}

/** Keep transport, operation and model failures distinct while sharing one visual language. */
export function RuntimeNotices({ connection, runtimeError, modelRetry, onDismissConnection, onRetrySync, onSelectAssistant }: RuntimeNoticesProps) {
  if (connection.phase === 'idle' && !runtimeError && !modelRetry) return null
  return <div className="my-3 space-y-3">
    <ConnectionNotice connection={connection} onDismiss={onDismissConnection} onRetrySync={onRetrySync} />
    {runtimeError && <NoticeCard tone="warning" title="操作未完成" description={runtimeError}
      actions={onSelectAssistant && /会话助手（ID：.+）已不在 Mon Core 中|请先为此会话选择助手/.test(runtimeError)
        ? <button type="button" className={noticeActionClass} onClick={onSelectAssistant}>重新选择助手</button> : undefined} />}
    {modelRetry && <NoticeCard title="模型响应中断，正在重试" busy
      description={`正在尝试继续生成回复，请稍候。第 ${modelRetry.attempt} / ${modelRetry.maxAttempts} 次重试。`} />}
  </div>
}
