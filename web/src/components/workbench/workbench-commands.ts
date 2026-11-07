import { editorGroups } from './editor-layout'
import { pageTitles, type WorkbenchAction, type WorkbenchState, type WorkbenchTab } from './workbench-state'
import type { DocumentLifecycle } from './document-lifecycle'
import type { WorkbenchCommand } from './WorkbenchDialogs'
import { movableDocument } from './plugin-placement'
export function buildWorkbenchCommands({state,dispatch,store,onSelect,onClose,onNewChat,sessionId,onOpenPage}: {
  state:WorkbenchState;dispatch(action:WorkbenchAction):void;store:DocumentLifecycle;onSelect(id:string):void;onClose(id:string):void;onNewChat():void;sessionId:string;onOpenPage?:(page:string)=>void
}):WorkbenchCommand[] {
  const active=state.tabs.find(tab=>tab.id===(state.active.application??state.active[state.focused])), groups=editorGroups(state.layout)
  const movable=!active||movableDocument(active)
  const group=groups.includes(state.focused)?state.focused:groups[0]
  const commands:WorkbenchCommand[]=[
    {id:'chat.new',title:'新建聊天页面',run:onNewChat},
    {id:'sidebar.toggle',title:'显示／隐藏主侧栏',shortcut:'Ctrl+B',run:()=>dispatch({type:'layout',patch:{sidebarOpen:!state.sidebarOpen}})},
    {id:'auxiliary.toggle',title:'显示／隐藏工具侧栏',shortcut:'Ctrl+Shift+B',run:()=>dispatch({type:'layout',patch:{sideOpen:!state.sideOpen}})},
    {id:'panel.toggle',title:'显示／隐藏运行面板',shortcut:'Ctrl+J',run:()=>dispatch({type:'layout',patch:{bottomOpen:!state.bottomOpen}})},
  ]
  if(movable)commands.push({id:'layout.right',title:'向右拆分编辑组',run:()=>dispatch({type:'split',group,axis:'horizontal',id:active?.id})},
    {id:'layout.down',title:'向下拆分编辑组',run:()=>dispatch({type:'split',group,axis:'vertical',id:active?.id})})
  for(const tab of state.tabs) commands.push({id:'open:'+tab.id,title:'切换页面：'+tab.title,run:()=>onSelect(tab.id)})
  if(onOpenPage)for(const [page,title] of Object.entries(pageTitles)) if(page!=='character') commands.push({id:'page:'+page,title:'打开：'+title,run:()=>onOpenPage(page)})
  for(const [position,title] of [['bottom','底部'],['top','顶部'],['left','左侧'],['right','右侧']] as const)
    commands.push({id:'panel.position.'+position,title:'将运行面板移至'+title,run:()=>dispatch({type:'layout',patch:{panelPosition:position,bottomOpen:true}})})
  if(active) {
    commands.push({id:'document.close',title:'关闭当前页面',shortcut:'Ctrl+W',run:()=>onClose(active.id)},
      {id:'document.save',title:'保存当前页面',shortcut:'Ctrl+S',run:()=>store.save(active.id)},
      {id:'document.pin',title:active.pinned?'取消固定当前标签':'固定当前标签',run:()=>dispatch({type:'pin',id:active.id})},
      {id:'document.duplicate',title:'复制当前页面视图',run:()=>dispatch({type:'open',document:{...active,id:active.id+':instance:'+crypto.randomUUID()},group})})
    if(movable)for(const [target,title] of [['auxiliary','工具侧栏'],['panel','运行面板'],...groups.map((id,index)=>[id,'编辑组 '+(index+1)])])
      if(target!==active.group) commands.push({id:'move:'+target,title:'将当前页面移至'+title,run:()=>dispatch({type:'move',id:active.id,group:target})})
  }
  if(groups.length>1) commands.push({id:'group.merge',title:'合并当前编辑组',run:()=>dispatch({type:'merge',group})})
  for(const tab of store.archived()) commands.push({id:'draft:'+tab.id,title:'恢复本机草稿：'+tab.title,run:()=>dispatch({type:'open',document:tab as WorkbenchTab})})
  return commands
}
