import { useState } from 'react'
import { ApplicationPageLayout } from '../../src/components/workbench/ApplicationPageLayout'
import { isApplicationPage } from '../../src/components/workbench/application-pages'
import { Workbench } from '../../src/components/workbench/Workbench'
import { useChatWorkbench } from '../../src/components/workbench/use-chat-workbench'
import { SelfAwakePage } from '../../src/pages/self-awake'

function Draft() {
  const [value, setValue] = useState('')
  return <textarea aria-label="布局验收草稿" value={value} onChange={event=>setValue(event.target.value)} />
}
export function ApplicationPagesAcceptance() {
  const [page, setPage] = useState('chat'), sessionId = (window as any).__testBoot.sessionId
  const workbench = useChatWorkbench({ account:'application-pages-test',sessionId,sessions:[{id:sessionId,title:'布局验收会话'}],
    onSelectSession:()=>{},onNewSession:()=>{},onShowChat:()=>setPage('chat') })
  ;(window as any).__applicationWorkbench = workbench.state
  return <ApplicationPageLayout sessionId={sessionId} page={{id:page,onChange:setPage,render:id=>id==='selfAwake'
    ? <SelfAwakePage onBack={()=>setPage('chat')}/> : null}}>
    <div style={{position:'fixed',inset:0}}><Workbench state={workbench.state} dispatch={workbench.dispatch}
      sessionId={sessionId} running={false} active={!isApplicationPage(page)} onSelect={workbench.select}
      onNewChat={workbench.newChat} onOpenPlugin={workbench.openPlugin} onOpenPage={setPage}
      storageKey={workbench.storageKey} hydrated={workbench.ready} renderChat={()=> <Draft/>}
      sidebar={<button onClick={()=>setPage('selfAwake')}>打开自醒</button>}/></div>
  </ApplicationPageLayout>
}
