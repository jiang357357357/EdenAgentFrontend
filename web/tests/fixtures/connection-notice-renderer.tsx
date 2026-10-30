import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useSessionConnectionFeedback } from '../../src/hooks/useSessionConnectionFeedback'
import { ConnectionNotice } from '../../src/components/chat/RuntimeNotices'
import { rpcRequest } from '../../src/lib/rpc-transport'

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
const read = (sessionId: string) => rpcRequest('event.list', { sessionId, afterSeq: '0', limit: 1 })

function Fixture() {
  const [selected, setSelected] = useState(ids[0]), [reads, setReads] = useState(0), [sent, setSent] = useState(0)
  const [error, setError] = useState('')
  const channel = useSessionConnectionFeedback(true, 0, selected, async sessionId => { await read(sessionId); setReads(value => value + 1) })
  useEffect(() => { void read(selected).catch(error => setError(String(error))) }, [selected])
  return <main className="min-h-screen bg-bg p-8 text-text" data-phase={channel.feedback?.phase ?? 'connecting'} data-reads={reads}>
    <h1 className="mb-6 text-xl">会话连接提示验收</h1>
    <nav className="mb-6 flex gap-4">{ids.map((id, index) => <button key={id} onClick={() => setSelected(id)}>会话 {String.fromCharCode(65 + index)}</button>)}</nav>
    <p className="mb-4">已发送 {sent} 条测试消息</p>
    <button className="mb-6" onClick={async () => {
      try { await rpcRequest('turn.start', { sessionId: selected, text: `fixture message ${sent + 1}`, attachments: [] }); setSent(value => value + 1) }
      catch (error) { setError(String(error)) }
    }}>发送测试消息</button>
    {channel.feedback && <ConnectionNotice connection={channel.feedback} onDismiss={channel.dismiss} onRetrySync={channel.retry} />}
    {error && <p data-fixture-error>{error}</p>}
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
