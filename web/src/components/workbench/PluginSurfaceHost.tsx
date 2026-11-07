import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { WorkbenchTab } from './workbench-state'
import type { DocumentLifecycle } from './document-lifecycle'
import { claimPluginWindow, pluginWindowMount, preparePluginWindow, preparePluginWindowClose, releasePluginWindow } from './plugin-windows'

export function FullPagePluginSurface({tab,visible,onBack,onClose,onSave,onCommands,notice,dirty,children}:{
  tab:WorkbenchTab;visible:boolean;onBack():void;onClose():void;onSave():void;onCommands():void;notice?:string;dirty:boolean;children:ReactNode
}) {
  const root=useRef<HTMLDivElement>(null)
  useLayoutEffect(()=>{if(visible)root.current?.focus({preventScroll:true})},[visible])
  return createPortal(<div ref={root} tabIndex={-1} hidden={!visible} inert={!visible} data-plugin-full-page={tab.id}
    className="fixed inset-0 z-20 flex flex-col overflow-hidden bg-bg text-text outline-none">
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <button type="button" onClick={onBack}>返回工作台</button><strong className="min-w-0 flex-1 truncate">{tab.title}{dirty?' · 未保存':''}</strong>
      <button onClick={onCommands}>命令</button>{dirty&&<button onClick={onSave}>保存</button>}<button onClick={onClose} aria-label={'关闭独占页面 '+tab.title}>关闭</button>
    </header>{notice&&<p role="status" className="shrink-0 px-4 py-2">{notice}</p>}<div className="min-h-0 flex-1 overflow-auto">{children}</div>
  </div>,document.body)
}

export function FloatingPluginSurface({tab,store,onClose,children}:{tab:WorkbenchTab;store:DocumentLifecycle;onClose():void;children:ReactNode}) {
  const [mount,setMount]=useState<HTMLElement>(),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
  const popup=useRef<Window|null>(null),latest=useRef({onClose});latest.current={onClose}
  const previousTab=useRef(tab)
  useEffect(()=>{
    if(popup.current&&!popup.current.closed){popup.current.focus();return}
    const lifetime=new AbortController(),window=claimPluginWindow(tab.id);popup.current=window
    if(!window){setError('无法打开浮动窗口：请检查浏览器弹窗设置，或关闭部分窗口（最多 8 个）。');return}
    let closing=false
    const beforeUnload=(event:BeforeUnloadEvent)=>{
      if(!store.entry(tab.id).dirty){closing=true;lifetime.abort();setMount(undefined);latest.current.onClose();return}
      event.preventDefault();event.returnValue=''
      latest.current.onClose();globalThis.window.focus()
    }
    void pluginWindowMount(window,lifetime.signal).then(target=>{
      if(lifetime.signal.aborted)return
      window.document.title=tab.title+' · Eden';window.addEventListener('beforeunload',beforeUnload)
      preparePluginWindowClose(tab.id,()=>{try{window.removeEventListener('beforeunload',beforeUnload)}catch{/* The window may already have left its trusted document. */}})
      setMount(target);setError('')
    }).catch(reason=>{if(!lifetime.signal.aborted)setError(String(reason))})
    const poll=setInterval(()=>{
      if(closing)return
      let left=false
      try{left=!window.closed&&window.location.pathname.split('/').at(-1)!=='extension-window.html'}catch{left=true}
      if(window.closed||left){
        closing=true;setMount(undefined);lifetime.abort()
        if(left){try{window.removeEventListener('beforeunload',beforeUnload)}catch{/* Foreign document; only close remains allowed. */}releasePluginWindow(tab.id,window);setError('窗口离开获准页面，已撤销连接。请重新打开。')}
        else if(!store.entry(tab.id).dirty)latest.current.onClose()
        else setError('窗口意外关闭，请重新打开并核对已保存的数据。')
      }
    },250)
    return()=>{lifetime.abort();clearInterval(poll);try{window.removeEventListener('beforeunload',beforeUnload)}catch{/* Closed or foreign document. */}releasePluginWindow(tab.id,window);popup.current=null}
  },[tab.id,attempt,store])
  useEffect(()=>{
    const changed=previousTab.current!==tab;previousTab.current=tab
    if(popup.current&&!popup.current.closed){popup.current.focus();try{popup.current.document.title=tab.title+' · Eden'}catch{/* Navigation is revoked by the lifecycle poll. */}}
    else if(changed)setAttempt(value=>value+1)
  },[tab])
  return <>
    {mount&&createPortal(<div data-plugin-floating={tab.id} className="flex h-screen flex-col bg-bg text-text">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4"><strong className="min-w-0 flex-1 truncate">{tab.title}</strong>
        {store.entry(tab.id).dirty&&<button onClick={()=>void store.save(tab.id).catch(reason=>setError(String(reason)))}>保存</button>}
        <button onClick={onClose}>关闭窗口</button></header>{error&&<p role="alert">{error}</p>}<div className="min-h-0 flex-1 overflow-auto">{children}</div></div>,mount)}
    {error&&<div role="alert" className="fixed bottom-8 right-4 z-50 max-w-sm rounded border border-border bg-surface p-3 text-text">
      <p>{tab.title}：{error}</p><button onClick={()=>{preparePluginWindow(tab.id);setAttempt(value=>value+1)}}>打开浮动窗口</button><button onClick={onClose}>关闭扩展</button>
    </div>}
  </>
}
