import {useState} from 'react'
import {Workbench} from '../../src/components/workbench/Workbench'
import {useChatWorkbench} from '../../src/components/workbench/use-chat-workbench'
import {ToolCard} from '../../src/components/chat/message/ToolCard'
import {PluginUiSession} from '../../src/components/plugin-ui/PluginUiProvider'
function Draft(){const[value,setValue]=useState('');return <><textarea aria-label="展示验收草稿" value={value} onChange={event=>setValue(event.target.value)}/><ToolCard tool={{id:'presentation-tool',name:'read_file',status:'success',input:'{}',output:'Temporary tool-card fixture'}}/></>}
export function PluginPresentationsAcceptance(){
  const boot=(window as any).__testBoot,[sessionId,setSessionId]=useState(boot.sessionId)
  const workbench=useChatWorkbench({account:'presentation-test',sessionId,sessions:[{id:boot.sessionId,title:'展示验收聊天'},{id:boot.secondSessionId,title:'另一聊天'}],onSelectSession:setSessionId,onNewSession:()=>{}})
  ;(window as any).__presentationState=workbench.state
  ;(window as any).__presentationSession=sessionId
  ;(window as any).__openPresentationSession=workbench.openSession
  return <div style={{position:'fixed',inset:0}}><Workbench state={workbench.state} dispatch={workbench.dispatch} sidebar={null}
    sessionId={sessionId} running={false} onSelect={workbench.select} onNewChat={workbench.newChat} onOpenPlugin={workbench.openPlugin}
    storageKey={workbench.storageKey} hydrated={workbench.ready} renderChat={tab=> <PluginUiSession sessionId={tab.sessionId}><Draft/></PluginUiSession>}/></div>
}
