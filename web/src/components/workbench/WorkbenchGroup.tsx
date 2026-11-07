import { useCallback } from 'react'
import { WorkbenchTabs } from './WorkbenchTabs'
import type { WorkbenchTab } from './workbench-state'
export function WorkbenchGroup({ id, title, tabs, active, onTarget, onToolbarTarget, onFocus, onSelect, onClose, onMove, onSplit, onMerge, onMenu, dirty, mainGroup }: {
  id:string;title:string;tabs:WorkbenchTab[];active:string|null;onTarget(id:string,element:HTMLDivElement|null):void
  onToolbarTarget(id:string,element:HTMLDivElement|null):void
  onFocus(id:string):void;onSelect(id:string):void;onClose(id:string):void;onMove(id:string,group:string,before?:string):void
  onSplit?:(axis:'horizontal'|'vertical')=>void;onMerge?:()=>void;onMenu(id:string):void;dirty(id:string):boolean;mainGroup:string
}) {
  const bind=useCallback((element:HTMLDivElement|null)=>onTarget(id,element),[id,onTarget])
  const bindToolbar=useCallback((element:HTMLDivElement|null)=>onToolbarTarget(id,element),[id,onToolbarTarget])
  return <section className="workbench-group" data-group-id={id} aria-label={title} onFocusCapture={()=>onFocus(id)} onPointerDownCapture={()=>onFocus(id)}>
    <WorkbenchTabs group={id} tabs={tabs} active={active} onSelect={onSelect} onClose={onClose} onMove={onMove} onSplit={onSplit} onMerge={onMerge} onMenu={onMenu} dirty={dirty} mainGroup={mainGroup} toolbar={<div className="workbench-document-actions" ref={bindToolbar}/>}/>
    <div className="workbench-group-content" ref={bind}>{!active&&<div className="workbench-empty">从标签、文件列表或扩展入口打开页面</div>}</div>
  </section>
}
