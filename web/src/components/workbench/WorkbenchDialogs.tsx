import { useEffect, useRef, useState } from 'react'
import type { DocumentLifecycle } from './document-lifecycle'
export interface WorkbenchCommand { id: string; title: string; shortcut?: string; run(args?: import('@eden/api').JsonValue[]): void | Promise<void> }
export function CommandPalette({ commands, onClose, onError }: { commands: WorkbenchCommand[]; onClose(): void; onError(message: string): void }) {
  const dialog=useRef<HTMLDialogElement>(null), [query,setQuery]=useState(''), [index,setIndex]=useState(0)
  const items=commands.filter(item=>item.title.toLowerCase().includes(query.toLowerCase()))
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[])
  const run=async(command:WorkbenchCommand)=>{onClose();try{await command.run()}catch(reason){onError(String(reason))}}
  return <dialog ref={dialog} className="workbench-palette" aria-label="工作台命令" onCancel={event=>{event.preventDefault();onClose()}}>
    <input autoFocus aria-label="搜索命令和页面" placeholder="搜索命令或打开的页面…" value={query} onChange={event=>{setQuery(event.target.value);setIndex(0)}}
      onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setIndex(value=>items.length?(value+(event.key==='ArrowDown'?1:items.length-1))%items.length:0)}if(event.key==='Enter'&&items[index]){event.preventDefault();void run(items[index])}}}/>
    <div role="listbox" aria-label="命令结果" className="surface-scrollbars">
      {items.map((command,i)=><button type="button" key={command.id} role="option" aria-selected={i===index} onMouseEnter={()=>setIndex(i)} onClick={()=>void run(command)}><span>{command.title}</span><kbd>{command.shortcut}</kbd></button>)}
      {!items.length&&<p className="p-4 text-sm text-text-muted">没有匹配的命令或页面。</p>}
    </div>
    <button type="button" className="sr-only" onClick={onClose}>关闭命令面板</button>
  </dialog>
}
export function CloseDocumentDialog({ id, title, store, onClose, onDiscard, onSaved }: {
  id:string;title:string;store:DocumentLifecycle;onClose():void;onDiscard():void;onSaved():void
}) {
  const dialog=useRef<HTMLDialogElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[])
  return <dialog ref={dialog} className="workbench-close-dialog" aria-label="关闭未保存页面" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
    <h2>保存“{title}”的修改？</h2><p>此页面有未保存内容。</p>{error&&<p role="alert" className="text-danger">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="button" disabled={busy} onClick={onDiscard}>放弃修改并关闭</button>
      {store.entry(id).save&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await store.save(id);onSaved()}catch(reason){setError(String(reason));setBusy(false)}}}>{busy?'正在保存…':store.entry(id).saveLabel?.includes('聊天草稿')?'保留本机草稿并关闭':'保存并关闭'}</button>}
    </footer>
  </dialog>
}
