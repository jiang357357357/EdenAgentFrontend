import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { MessageSquare, PanelBottom, PanelLeft, PanelRight, Search } from 'lucide-react'
import { PluginUiView } from '../plugin-ui/PluginUiSlot'
import { usePluginUi, PluginUiSession } from '../plugin-ui/PluginUiProvider'
import { WorkbenchSurface } from './WorkbenchSurface'
import { WorkbenchSeparator } from './WorkbenchSeparator'
import { WorkbenchDiagnostics } from './WorkbenchDiagnostics'
import { WorkbenchPluginMenu } from './WorkbenchPluginMenu'
import { WorkbenchCharacterMenu, type WorkbenchCharacterActions } from './WorkbenchCharacterMenu'
import { WorkbenchGroup } from './WorkbenchGroup'
import { WorkspaceFileView } from './WorkspaceFileView'
import { EditorGrid } from './EditorGrid'
import { editorGroups, minimumEditorExtent } from './editor-layout'
import { DocumentLifecycle, DocumentScope, useLifecycleRevision } from './document-lifecycle'
import { CommandPalette, CloseDocumentDialog } from './WorkbenchDialogs'
import { buildWorkbenchCommands } from './workbench-commands'
import type { WorkbenchAction, WorkbenchState, WorkbenchTab } from './workbench-state'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import { useExtensionWorkbench } from './use-extension-workbench'
import { ExtensionWorkbenchContext, ExtensionContributionContext, ExtensionActivityContext } from '../plugin-ui/ExtensionWorkbenchContext'
import { WorkbenchExtensionActions } from './WorkbenchExtensionActions'
import { ExtensionSettings } from '../plugin-ui/ExtensionSettings'
import { ExtensionDiagnostics } from '../plugin-ui/ExtensionDiagnostics'
import { createPortal } from 'react-dom'
import { FullPagePluginSurface, FloatingPluginSurface } from './PluginSurfaceHost'
import { movableDocument } from './plugin-placement'

export function Workbench({state,dispatch,sidebar,children,sessionId,running,onSelect,onNewChat,portrait,onManagePlugins,onOpenPlugin,
  error,onRetry,hydrated=true,storageKey='standalone-workbench',renderChat,characterMenu,onOpenPage,active=true}: {
  state:WorkbenchState;dispatch(action:WorkbenchAction):void;sidebar:ReactNode;children?:ReactNode;sessionId:string;running:boolean
  onSelect(id:string):void;onNewChat():void;portrait?:ReactNode;onManagePlugins?:()=>void;onOpenPlugin(view:PluginUiLoadedView,sessionId?:string):void
  error?:string;onRetry?:()=>void;hydrated?:boolean;storageKey?:string
  renderChat?:(tab:WorkbenchTab & {kind:'chat'},focused:boolean)=>ReactNode
  characterMenu?:WorkbenchCharacterActions
  onOpenPage?:(page:string)=>void;active?:boolean
}) {
  const {views,catalogReady}=usePluginUi()
  const [width,setWidth]=useState(()=>typeof window==='undefined'?1280:window.innerWidth||1280)
  const [height,setHeight]=useState(()=>typeof window==='undefined'?800:window.innerHeight||800)
  const [targets,setTargets]=useState<Record<string,HTMLDivElement|null>>({})
  const [toolbarTargets,setToolbarTargets]=useState<Record<string,HTMLDivElement|null>>({})
  const [palette,setPalette]=useState(false),[closing,setClosing]=useState<string>(),[notice,setNotice]=useState('')
  const [showRun,setShowRun]=useState(true)
  const [extensionSettings,setExtensionSettings]=useState(false),[contextMenu,setContextMenu]=useState<{path:string;x:number;y:number}>()
  const [extensionDiagnostics,setExtensionDiagnostics]=useState(false)
  const store=useMemo(()=>new DocumentLifecycle(storageKey),[storageKey]); useLifecycleRevision(store)
  useEffect(()=>{
    if(!hydrated||!catalogReady)return
    for(const tab of state.tabs)if(tab.kind==='plugin') {
      const view=views.find(view=>view.key===tab.viewKey)
      if(view&&tab.slot!==view.view.slot)dispatch({type:'replace',id:tab.id,document:{...tab,slot:view.view.slot}})
      else if(!view&&(tab.group==='application'||tab.group==='floating')){store.releaseDocument(tab.id);dispatch({type:'close',id:tab.id})}
    }
  },[views,catalogReady,hydrated,dispatch])
  const groups=editorGroups(state.layout),primary=groups[0],minimum=minimumEditorExtent(state.layout)
  const auxiliary=state.sideOpen&&state.tabs.some(tab=>tab.group==='auxiliary')
  const sidebarWidth=state.sidebarOpen&&width>=1200?Math.min(state.sidebarWidth,width*.25):64
  const desiredPanelSide=state.bottomOpen&&(state.panelPosition==='left'||state.panelPosition==='right')
  const panelSpace=desiredPanelSide?Math.min(state.panelWidth,width*.4):0
  const availableHeight=height-64-(state.bottomOpen&&!desiredPanelSide?state.bottomHeight+4:0)
  const compact=width<1000||width-sidebarWidth-panelSpace-(auxiliary?264:0)<minimum.width||availableHeight<minimum.height
  const sideWidth=Math.min(state.sideWidth,Math.max(260,width-sidebarWidth-panelSpace-minimum.width-8))
  const panelSide=!compact&&(state.panelPosition==='left'||state.panelPosition==='right')
  const fullPage=state.tabs.find(tab=>tab.group==='application'&&tab.id===state.active.application)
  const focused=fullPage??state.tabs.find(tab=>tab.id===state.active[state.focused])
  const layoutTabs=state.tabs.filter(tab=>tab.group!=='application'&&tab.group!=='floating')
  const extensionSessionId=focused?.sessionId??sessionId
  const extensions=useExtensionWorkbench({sessionId:extensionSessionId,running,activeView:focused?.kind==='plugin'?focused.viewKey:undefined,onOpenView:onOpenPlugin,notice:setNotice,active})
  const single=state.active[state.focused]??state.active[primary]??state.active.auxiliary??state.active.panel
  const bind=useCallback((id:string,element:HTMLDivElement|null)=>setTargets(current=>current[id]===element?current:{...current,[id]:element}),[])
  const bindToolbar=useCallback((id:string,element:HTMLDivElement|null)=>setToolbarTargets(current=>current[id]===element?current:{...current,[id]:element}),[])
  const focus=useCallback((group:string)=>dispatch({type:'focus',group}),[dispatch])
  const move=(id:string,group:string,before?:string)=>dispatch({type:'move',id,group,before})
  const close=(id:string)=>{
    if(store.entry(id).dirty){setClosing(id);return}
    try { const tab=state.tabs.find(tab=>tab.id===id);if(tab)store.remember(tab);store.releaseDocument(id);dispatch({type:'close',id}) }
    catch(reason){setNotice(String(reason))}
  }
  const commands=[...buildWorkbenchCommands({state,dispatch,store,onSelect,onClose:close,onNewChat,sessionId,onOpenPage}),...extensions.commands,
    {id:'extensions.settings',title:'打开扩展设置',run:()=>setExtensionSettings(true)},
    {id:'extensions.diagnostics',title:'查看扩展诊断',run:()=>setExtensionDiagnostics(true)}]
  const run=async(id:string)=>{try{await commands.find(command=>command.id===id)?.run()}catch(reason){setNotice(String(reason))}}
  useEffect(()=>{const resize=()=>{setWidth(window.innerWidth);setHeight(window.innerHeight)};window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[])
  useEffect(()=>{setShowRun(!state.active.panel)},[state.active.panel])
  useEffect(()=>{
    if(active)return
    setPalette(false);setClosing(undefined);setExtensionSettings(false);setExtensionDiagnostics(false);setContextMenu(undefined)
    document.querySelectorAll<HTMLElement>('.workbench-shell :popover-open').forEach(element=>element.hidePopover())
  },[active])
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      if(!active||event.defaultPrevented||!(event.ctrlKey||event.metaKey)||event.altKey||document.querySelector('dialog[open]'))return
      if(fullPage){if(event.key.toLowerCase()==='p'){event.preventDefault();setPalette(true)}return}
      const key=event.key.toLowerCase()
      if(key==='p'){event.preventDefault();setPalette(true);return}
      const command=key==='s'?'document.save':key==='w'||event.key==='F4'?'document.close':key==='j'?'panel.toggle':key==='b'?(event.shiftKey?'auxiliary.toggle':'sidebar.toggle'):null
      if(command){event.preventDefault();void run(command)}
      if(event.key==='\\'){event.preventDefault();void run(event.shiftKey?'layout.down':'layout.right')}
      if(/^[1-9]$/.test(key)&&groups[Number(key)-1]){event.preventDefault();focus(groups[Number(key)-1]);targets[groups[Number(key)-1]]?.querySelector<HTMLElement>('textarea,input,button')?.focus()}
    }
    // Electron owns its quit/drain transaction; a renderer veto after draining
    // would leave a cancelled quit with stopped servers. Tabs use our own dialog.
    const unload=(event:BeforeUnloadEvent)=>{if(!window.edenAgentDesktop&&store.anyDirty()){event.preventDefault();event.returnValue=''}}
    window.addEventListener('keydown',keyboard);window.addEventListener('beforeunload',unload)
    return()=>{window.removeEventListener('keydown',keyboard);window.removeEventListener('beforeunload',unload)}
  },[state,store,commands,active,fullPage])
  const group=(id:string,title:string,tabs=state.tabs.filter(tab=>tab.group===id),active=state.active[id],editable=false)=><WorkbenchGroup key={id} id={id} title={title} tabs={tabs} active={active??null} onTarget={bind} onToolbarTarget={bindToolbar} onFocus={focus} onSelect={onSelect} onClose={close} onMove={move}
    mainGroup={primary} onMenu={()=>setPalette(true)} dirty={id=>store.entry(id).dirty}
    onSplit={editable&&(!tabs.find(tab=>tab.id===active)||movableDocument(tabs.find(tab=>tab.id===active)!))?axis=>dispatch({type:'split',group:id,axis,id:state.active[id]??undefined}):undefined}
    onMerge={editable&&groups.length>1?()=>dispatch({type:'merge',group:id}):undefined}/>
  const target=(tab:WorkbenchTab)=>targets[compact?'compact':tab.group]??null
  const visible=(tab:WorkbenchTab)=>compact?single===tab.id:state.active[tab.group]===tab.id&&(tab.group!=='auxiliary'||auxiliary)&&(tab.group!=='panel'||state.bottomOpen&&!showRun)
  const portraitTab=state.tabs.find(tab=>tab.kind==='page'&&tab.page==='character')
  const portraitVisible=Boolean(portraitTab&&visible(portraitTab))
  const content=(tab:WorkbenchTab)=>{
    if(tab.kind==='chat')return renderChat?.(tab,active&&!fullPage&&focused?.id===tab.id)
    if(tab.kind==='file') {
      const editor=views.find(view=>view.module.document.apiVersion===2&&'renderer' in view.view&&view.view.renderer==='editor'
        &&view.view.filePatterns.some(pattern=>pattern.startsWith('*.')?tab.path.toLowerCase().endsWith(pattern.slice(1).toLowerCase()):tab.path.split(/[\\/]/).at(-1)===pattern))
      return <div className="h-full" onContextMenu={event=>{if(extensions.menus.some(menu=>menu.location==='editor/context')){event.preventDefault();setContextMenu({path:tab.path,x:event.clientX,y:event.clientY})}}}>
        {editor?<PluginUiSession sessionId={tab.sessionId}><PluginUiView view={editor} documentPath={tab.path}/></PluginUiSession>:<WorkspaceFileView sessionId={tab.sessionId} path={tab.path} title={tab.title}/>}</div>
    }
    if(tab.kind==='plugin'){
      if(!hydrated)return <p className="p-5 text-text-muted">正在恢复工作台…</p>
      const view=views.find(view=>view.key===tab.viewKey)
      return view?<PluginUiSession sessionId={tab.sessionId}><PluginUiView key={view.module.revision} view={view}/></PluginUiSession>:<p className="p-5 text-text-muted">扩展尚未加载或已停用。<button onClick={onManagePlugins}>打开插件管理</button></p>
    }
    return tab.page==='character'?portrait:null
  }
  const finishClose=(discard:boolean)=>{
    const tab=state.tabs.find(tab=>tab.id===closing);if(!tab)return
    if(discard)store.discard(tab.id);else store.remember(tab)
    store.releaseDocument(tab.id)
    dispatch({type:'close',id:tab.id});setClosing(undefined)
  }
  const panel=<div className="workbench-panel-region" data-run={showRun} style={panelSide?{width:Math.min(state.panelWidth,width*.4)}:{height:Math.min(state.bottomHeight,typeof window==='undefined'?400:window.innerHeight*.55)}}>
    <button type="button" className="workbench-run-tab" aria-pressed={showRun} onClick={()=>setShowRun(true)}>运行记录</button>
    {group('panel','运行面板页面')}
    {showRun&&<WorkbenchDiagnostics sessionId={sessionId} running={running} onClose={()=>dispatch({type:'layout',patch:{bottomOpen:false}})}/>}
  </div>
  const extensionActivity=<WorkbenchExtensionActions menus={extensions.menus} location="activity" onError={setNotice}/>
  const overlays=<>{palette&&<CommandPalette commands={commands} onClose={()=>setPalette(false)} onError={setNotice}/>}
    {closing&&<CloseDocumentDialog id={closing} title={state.tabs.find(tab=>tab.id===closing)?.title??''} store={store} onClose={()=>setClosing(undefined)} onDiscard={()=>finishClose(true)} onSaved={()=>finishClose(false)}/>}
    {extensionSettings&&<ExtensionSettings sessionId={extensionSessionId} onClose={()=>setExtensionSettings(false)}/>}
    {extensionDiagnostics&&<ExtensionDiagnostics onClose={()=>setExtensionDiagnostics(false)}/>}</>
  return <ExtensionWorkbenchContext.Provider value={extensions.actions}><ExtensionContributionContext.Provider value={{sessionAvailable:Boolean(extensionSessionId),sessionRunning:running,activeView:focused?.kind==='plugin'?focused.viewKey:undefined}}><ExtensionActivityContext.Provider value={extensionActivity}><><div hidden={Boolean(fullPage)} inert={Boolean(fullPage)} className="h-full w-full"><div className="workbench-shell" data-compact={compact} style={{'--workbench-sidebar-width':sidebarWidth+'px','--workbench-side-width':sideWidth+'px'} as CSSProperties}>
    <header className="workbench-titlebar"><strong>Eden <span>工作台</span></strong><div className="flex items-center gap-1">
      <button className="workbench-command" aria-label="打开工作台命令" onClick={()=>setPalette(true)}><Search size={15}/><span>命令</span></button>
      <WorkbenchPluginMenu onOpen={onOpenPlugin} onManage={onManagePlugins}/><button className="workbench-command" aria-label="新建聊天页面" onClick={onNewChat}><MessageSquare size={16}/><span>新聊天</span></button>
      <WorkbenchExtensionActions menus={extensions.menus} location="toolbar" onError={setNotice}/>
      {characterMenu&&<WorkbenchCharacterMenu {...characterMenu} portraitVisible={portraitVisible} onToggleEditing={()=>{characterMenu.onToggleEditing();if(!characterMenu.editing&&portraitTab?.group==='panel')setShowRun(false)}} onTogglePortrait={()=>{if(portraitVisible&&portraitTab)close(portraitTab.id);else {characterMenu.onShowPortrait();if(portraitTab?.group==='panel')setShowRun(false)}}}/>}
      <button className="workbench-icon" aria-label="切换主侧栏" onClick={()=>void run('sidebar.toggle')}><PanelLeft size={16}/></button>
      <button className="workbench-icon" aria-label="切换工具侧栏" onClick={()=>void run('auxiliary.toggle')}><PanelRight size={16}/></button>
      <button className="workbench-icon" aria-label="切换运行面板" onClick={()=>void run('panel.toggle')}><PanelBottom size={16}/></button>
    </div></header>
    <div className="workbench-body">
      {!sidebar&&extensions.menus.some(menu=>menu.location==='activity')&&<nav aria-label="扩展导航" className="flex w-16 shrink-0 flex-col border-r border-border">{extensionActivity}</nav>}
      <div className="workbench-sidebar" data-collapsed={sidebarWidth===64}>{sidebar}</div>
      {sidebarWidth>64&&<WorkbenchSeparator label="主侧栏宽度" value={sidebarWidth} min={220} max={440} onChange={sidebarWidth=>dispatch({type:'layout',patch:{sidebarWidth}})}/>}
      <div className="workbench-editors workbench-panel-layout" data-position={compact?'bottom':state.panelPosition}>
        <div className="workbench-groups">{compact?group('compact','编辑器',layoutTabs,single??null):<EditorGrid layout={state.layout} onResize={(id,ratio)=>dispatch({type:'resize',id,ratio})} renderGroup={id=>group(id,'编辑组 '+(groups.indexOf(id)+1),undefined,undefined,true)}/>}</div>
        {state.bottomOpen&&<><WorkbenchSeparator label={panelSide?'运行面板宽度':'运行面板高度'} value={panelSide?state.panelWidth:state.bottomHeight} min={120} max={panelSide?width*.4:500} horizontal={!panelSide} reverse={state.panelPosition==='right'||state.panelPosition==='bottom'} onChange={value=>dispatch({type:'layout',patch:panelSide?{panelWidth:value}:{bottomHeight:value}})}/>{panel}</>}
      </div>
      {!compact&&auxiliary&&<><WorkbenchSeparator label="工具侧栏宽度" value={sideWidth} min={260} max={Math.max(260,width-sidebarWidth-420)} reverse onChange={sideWidth=>dispatch({type:'layout',patch:{sideWidth}})}/><aside className="workbench-tool-sidebar" aria-label="工具侧栏" style={{width:sideWidth}}>{group('auxiliary','工具侧栏内容')}</aside></>}
    </div>
    <footer className="workbench-status"><span>{running?'● 任务执行中':'就绪'}</span>{extensions.statusItems.filter(item=>item.alignment==='left').map(item=><button key={item.key} disabled={!item.command} onClick={()=>void Promise.resolve(item.command?.run()).catch(reason=>setNotice(String(reason)))}>{item.text}</button>)}<span role={error||notice?'alert':undefined}>{error||notice||store.notice||'Ctrl+Shift+P 打开命令 · 拖动标签或分隔线调整布局'}</span>{error&&onRetry&&<button onClick={onRetry}>重新连接工作台</button>}{extensions.operations.map(item=><button key={item.id} data-extension-running={item.execution.status().runningOperations>0} onClick={()=>item.controller.abort()}>{item.title} · 取消</button>)}{extensions.statusItems.filter(item=>item.alignment==='right').map(item=><button key={item.key} disabled={!item.command} onClick={()=>void Promise.resolve(item.command?.run()).catch(reason=>setNotice(String(reason)))}>{item.text}</button>)}<button onClick={()=>void run('panel.toggle')}>运行记录</button></footer>
    {layoutTabs.map(tab=><WorkbenchSurface key={tab.id} target={target(tab)} toolbarTarget={toolbarTargets[compact?'compact':tab.group]} visible={active&&!fullPage&&visible(tab)} name={tab.id} onActivate={()=>focus(tab.group)}><DocumentScope store={store} id={tab.id}>{content(tab)}</DocumentScope></WorkbenchSurface>)}
    {typeof document==='undefined'&&children}
    {contextMenu&&<div role="menu" aria-label="文件扩展操作" className="fixed z-50 rounded border border-border bg-surface p-2 shadow-lg" style={{left:contextMenu.x,top:contextMenu.y}}>{extensions.menus.filter(menu=>menu.location==='editor/context').map(menu=><button key={menu.command.id} role="menuitem" className="block p-2" onClick={()=>{setContextMenu(undefined);void Promise.resolve(menu.command.run([contextMenu.path])).catch(reason=>setNotice(String(reason)))}}>{menu.command.title}</button>)}<button role="menuitem" onClick={()=>setContextMenu(undefined)}>关闭</button></div>}
  </div></div>
    {state.tabs.filter(tab=>tab.group==='application'||tab.group==='floating').map(tab=>{
      const element=<DocumentScope store={store} id={tab.id}><ExtensionContributionContext.Provider value={{sessionAvailable:Boolean(tab.sessionId),sessionRunning:tab.sessionId===sessionId&&running,activeView:tab.kind==='plugin'?tab.viewKey:undefined}}>{content(tab)}</ExtensionContributionContext.Provider></DocumentScope>
      return tab.group==='application'?<FullPagePluginSurface key={tab.id} tab={tab} visible={active&&fullPage?.id===tab.id} dirty={store.entry(tab.id).dirty}
        onCommands={()=>setPalette(true)} notice={notice||store.notice} onBack={()=>dispatch({type:'dismissApplication'})} onClose={()=>close(tab.id)} onSave={()=>void store.save(tab.id).catch(reason=>setNotice(String(reason)))}>{element}</FullPagePluginSurface>
        :<FloatingPluginSurface key={tab.id} tab={tab} store={store} onClose={()=>close(tab.id)}>{element}</FloatingPluginSurface>
    })}
    {typeof document==='undefined'?overlays:createPortal(overlays,document.body)}
  </></ExtensionActivityContext.Provider></ExtensionContributionContext.Provider></ExtensionWorkbenchContext.Provider>
}
