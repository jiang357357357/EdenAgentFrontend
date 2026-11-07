import { useState } from 'react'
import { X } from 'lucide-react'
import { OperationPanel } from '../chat/OperationPanel'
import { MonSyncPanel } from '../chat/MonSyncPanel'
import { McpPanel } from '../chat/McpPanel'

export function WorkbenchDiagnostics({ sessionId, running, onClose }: { sessionId: string; running: boolean; onClose: () => void }) {
  const [tab, setTab] = useState('tasks')
  return <section className="workbench-bottom" aria-label="工作台运行面板">
    <header><div role="tablist" aria-label="运行面板标签">
      {[['tasks', '任务'], ['operations', '操作记录'], ['connections', '连接']].map(([id, title]) => <button key={id} type="button" role="tab" aria-selected={id === tab} onClick={() => setTab(id)}>{title}</button>)}
    </div><button type="button" className="workbench-icon" aria-label="关闭运行面板" onClick={onClose}><X size={16} /></button></header>
    <div className="surface-scrollbars min-h-0 flex-1 overflow-auto p-4" role="tabpanel">
      {tab === 'tasks' ? <p className="text-sm text-text-muted" role="status">{running ? '当前会话正在执行任务。详细进度和审批显示在聊天中。' : '当前会话没有正在执行的任务。'}</p>
        : !sessionId ? <p className="text-sm text-text-muted">选择会话后查看运行记录。</p>
          : tab === 'connections' ? <McpPanel key={sessionId} sessionId={sessionId} />
            : <><OperationPanel key={sessionId} sessionId={sessionId} /><MonSyncPanel sessionId={sessionId} /></>}
    </div>
  </section>
}
