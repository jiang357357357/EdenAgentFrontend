import { useCallback, useEffect, useRef } from 'react'
import { useWorkbench } from './use-workbench'
import type { WorkbenchDocument } from './workbench-state'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import type { WorkspaceEntry } from '../../lib/agent-client'
import { preparePluginWindow } from './plugin-windows'
export function useChatWorkbench({ account, sessionId, sessions, onSelectSession, onNewSession, onShowChat }: {
  account: string; sessionId: string; sessions: { id: string; title: string }[]
  onSelectSession: (id: string) => void; onNewSession: () => void; onShowChat?: () => void
}) {
  const workbench = useWorkbench(account), {state, dispatch, ready} = workbench
  const initialized = useRef(false), selected = useRef(sessionId)
  const chatDocument = (id: string): WorkbenchDocument => ({id:'chat:'+id,kind:'chat',sessionId:id,title:sessions.find(s=>s.id===id)?.title || '新会话'})
  const openSession = (id: string) => {
    const existing=state.tabs.find(tab=>tab.kind==='chat'&&tab.sessionId===id)
    dispatch({type:'open',document:existing ?? chatDocument(id)})
    selected.current=id; onSelectSession(id); onShowChat?.()
  }
  const newChat = () => {
    dispatch({type:'open',document:{id:'chat:draft:'+crypto.randomUUID(),kind:'chat',sessionId:'',title:'新会话'}})
    selected.current=''; onNewSession(); onShowChat?.()
  }
  useEffect(()=>{
    if(!ready) { initialized.current=false; return }
    if(!initialized.current) {
      initialized.current=true
      if(!state.tabs.length) dispatch({type:'open',document:chatDocument(sessionId)})
      const restored=state.tabs.find(tab=>tab.kind==='chat'&&Object.values(state.active).includes(tab.id))
      if(restored?.kind==='chat'&&restored.sessionId) { selected.current=restored.sessionId; onSelectSession(restored.sessionId) }
    } else if(selected.current!==sessionId) {
      selected.current=sessionId
      if(sessionId) dispatch({type:'open',document:state.tabs.find(tab=>tab.kind==='chat'&&tab.sessionId===sessionId) ?? chatDocument(sessionId)})
    }
  },[ready,sessionId,dispatch])
  const focused=state.tabs.find(tab=>tab.id===(state.active.application??state.active[state.focused]))
  useEffect(()=>{
    if(!ready||!focused) return
    if(focused.kind==='chat'&&focused.sessionId!==sessionId) {selected.current=focused.sessionId; focused.sessionId?onSelectSession(focused.sessionId):onNewSession()}
    if(focused.kind!=='chat'&&focused.sessionId&&focused.sessionId!==sessionId) {selected.current=focused.sessionId;onSelectSession(focused.sessionId)}
  },[ready,focused?.id,state.focused])
  useEffect(()=>{
    for(const tab of state.tabs) if(tab.kind==='chat'&&tab.sessionId) {
      const title=sessions.find(session=>session.id===tab.sessionId)?.title
      if(title&&title!==tab.title) dispatch({type:'replace',id:tab.id,document:{...tab,title}})
    }
  },[sessions,dispatch])
  const openPlugin = (view: PluginUiLoadedView, boundSessionId = sessionId) => {
    if(!ready)return
    if(view.view.slot==='tool_card')throw new Error('工具卡片只能随绑定的工具结果显示')
    if('renderer' in view.view&&view.view.renderer==='editor')throw new Error('文件编辑器请从匹配的文件入口打开')
    const id='plugin:'+view.key+':'+(boundSessionId||'none')
    if(view.view.slot==='full_page')window.focus()
    if(view.view.slot==='floating_window')preparePluginWindow(id)
    dispatch({type:'open',document:{id,kind:'plugin',title:view.view.title,viewKey:view.key,sessionId:boundSessionId,slot:view.view.slot}})
    onShowChat?.()
  }
  const resetFiles=useCallback(()=>dispatch({type:'removeFiles',sessionId}),[dispatch,sessionId])
  return {...workbench,select:(id:string)=>{
    const tab=state.tabs.find(tab=>tab.id===id)
    if(tab?.kind==='plugin'&&tab.slot==='floating_window'){preparePluginWindow(id);dispatch({type:'open',document:tab})}
    else dispatch({type:'select',id})
    onShowChat?.()
  },newChat,openSession,openPlugin,
    openChat:()=>sessionId?openSession(sessionId):newChat(),
    openFile:(entry:WorkspaceEntry)=>dispatch({type:'open',document:{id:'file:'+sessionId+':'+entry.path,kind:'file',title:entry.name,sessionId,path:entry.path}}),
    openPortrait:()=>dispatch({type:'open',document:{id:'page:character',kind:'page',page:'character',title:'角色立绘'},group:'auxiliary'}),
    bindSession:(id:string,created:string)=>{dispatch({type:'replace',id,document:{id,kind:'chat',sessionId:created,title:'新会话'}});if(state.active[state.focused]===id){selected.current=created;onSelectSession(created)}},
    resetFiles}
}
