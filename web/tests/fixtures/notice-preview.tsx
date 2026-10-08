import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import { NoticeCard, noticeActionClass } from '../../src/components/feedback'
import { ConnectionNotice } from '../../src/components/chat/RuntimeNotices'
import { PermissionRequestCard, QuestionRequestCard } from '../../src/components/requests'
import { ToolCard } from '../../src/components/chat/message/ToolCard'
import { ConnectionFeedback, initialConnectionFeedback } from '../../src/lib/connection-feedback'

function Preview() {
  const [connection, setConnection] = useState(initialConnectionFeedback)
  const feedback = useMemo(() => new ConnectionFeedback(setConnection), [])
  const [theme, setTheme] = useState('night')
  const [result, setResult] = useState('尚未操作')
  const [visible, setVisible] = useState(true)
  const [fail, setFail] = useState(false)
  const disconnect = () => { feedback.opened(); feedback.disconnected('与服务的网络连接意外中断') }
  const changeTheme = () => {
    const next = theme === 'night' ? 'cream' : 'night'
    document.documentElement.dataset.baseTheme = next
    setTheme(next)
  }
  return <main className="h-screen overflow-auto bg-bg p-5 text-text sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-xs uppercase tracking-widest text-accent">Eden · 组件验收</p>
          <h1 className="text-2xl font-semibold">提示与反馈</h1>
          <p className="mt-2 text-sm text-text-muted">仅使用演示数据。所有按钮均在本页模拟，不访问账号或执行工具。</p></div>
        <button type="button" className={noticeActionClass} onClick={changeTheme}>{theme === 'night' ? '切换浅色' : '切换深色'}</button>
      </header>
      <section className="space-y-3" aria-label="连接状态预览">
        <h2 className="font-medium">连接状态</h2>
        <div className="flex flex-wrap gap-2">
          <button className={noticeActionClass} onClick={disconnect}>模拟断连</button>
          <button className={noticeActionClass} onClick={() => feedback.opened()}>重新连接</button>
          <button className={noticeActionClass} onClick={() => feedback.synchronized(connection.revision)}>同步完成</button>
          <button className={noticeActionClass} onClick={() => feedback.synchronized(connection.revision, '演示：历史读取超时')}>同步失败</button>
        </div>
        <ConnectionNotice connection={connection} onDismiss={() => feedback.dismiss()}
          onRetrySync={() => { feedback.synchronizing(); setResult('已请求重新同步') }} />
        <p className="rounded-xl border border-border bg-card p-4 text-sm">已有聊天记录：两个会话的工具结果仍保留在这里。</p>
      </section>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <section className="space-y-3" aria-label="系统提示预览">
          <h2 className="font-medium">系统提示</h2>
          <NoticeCard title="正在准备回复" description="信息正在加载，请稍候。" busy />
          <NoticeCard tone="warning" title="操作未完成" description="当前助手暂不可用，请重新选择后继续。"
            actions={<button className={noticeActionClass} onClick={() => setResult('已请求选择助手')}>重新选择助手</button>} />
          <NoticeCard tone="error" title="模型请求超时" description="本次回复未完成，请核对任务状态后再重试。"
            badge="演示模型" details="Fixture timeout: no real request was sent." detailsLabel="查看技术详情" />
          {visible && <NoticeCard tone="success" title="设置已保存" description="新设置已生效。" onDismiss={() => setVisible(false)} />}
          <NoticeCard tone="neutral" role="group" title="角色提醒" description="下午的讨论将在十分钟后开始。"
            actions={<button className={noticeActionClass} onClick={() => setResult('已确认提醒')}>知道了</button>} />
        </section>
        <section className="space-y-3" aria-label="业务卡片预览">
          <h2 className="font-medium">需要处理的事项</h2>
          <label className="flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)} />模拟答复失败</label>
          <PermissionRequestCard request={{ id: 'permission-preview', sessionID: 'session-preview', permission: '写入文件',
            patterns: ['notes/summary.md'], always: ['notes/*'], metadata: { reason: '保存本次讨论摘要' } }}
            onReply={async (_id, reply) => { if (fail) throw new Error('演示：连接暂时不可用'); setResult(`权限答复：${reply}`) }} />
          <QuestionRequestCard request={{ id: 'question-preview', sessionID: 'session-preview', questions: [{
            header: '输出格式', question: '希望以哪种形式保存摘要？', options: [
              { label: 'Markdown', description: '适合继续编辑' }, { label: '纯文本', description: '便于复制' },
            ], custom: true,
          }] }} onReply={async (_id, answers) => { if (fail) throw new Error('演示：答复未提交'); setResult(`问题答复：${answers.flat().join('、')}`) }}
            onReject={async () => { setResult('已暂缓问题') }} />
          <ToolCard tool={{ id: 'tool-preview', name: 'write_file', input: '{"path":"notes/summary.md"}',
            output: '摘要已写入 notes/summary.md', status: 'success', duration: 45 }} />
        </section>
      </div>
      <p role="status" className="rounded-xl border border-border bg-card p-3 text-sm text-text-muted">演示操作结果：{result}</p>
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<Preview />)
