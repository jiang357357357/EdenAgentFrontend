import { FileText, MessageSquare, PanelsTopLeft, Puzzle, X, ArrowRightToLine, ArrowLeftToLine, MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EditorGroup, WorkbenchTab } from './workbench-state'
import { movableDocument } from './plugin-placement'

export function WorkbenchTabs({ tabs, active, group, onSelect, onClose, onMove, onSplit, onMerge, onMenu, dirty, mainGroup='main', toolbar }: {
  tabs: WorkbenchTab[]; active: string | null; group: EditorGroup
  onSelect: (id: string) => void; onClose: (id: string) => void; onMove: (id: string, group: EditorGroup, before?: string) => void
  onSplit?:(axis:'horizontal'|'vertical')=>void;onMerge?:()=>void;onMenu?:(id:string)=>void;dirty?:(id:string)=>boolean;mainGroup?:string
  toolbar?:ReactNode
}) {
  const current = tabs.find(tab => tab.id === active)
  const other = current?.group === 'auxiliary'||current?.group==='panel' ? mainGroup : 'auxiliary'
  const moveLabel = other==='auxiliary'?'将当前页面移至工具侧栏':'将当前页面移至主区'
  function drop(event: React.DragEvent, before?: string) {
    const id = event.dataTransfer.getData('application/x-eden-workbench-tab')
    if (!id) return
    event.preventDefault(); onMove(id, group, before)
  }
  return <header className="workbench-tabs" onDragOver={event => { if (event.dataTransfer.types.includes('application/x-eden-workbench-tab')) event.preventDefault() }} onDrop={event => drop(event)}>
    <div className="workbench-tablist surface-scrollbars" role="tablist" aria-label={group==='auxiliary'?'工具侧栏标签':group==='panel'?'运行面板页面标签':'编辑器标签 '+group}>
      {tabs.map(tab => {
        const Icon = tab.kind === 'chat' ? MessageSquare : tab.kind === 'file' ? FileText : tab.kind === 'plugin' ? Puzzle : PanelsTopLeft
        return <div key={tab.id} className="workbench-tab" data-active={tab.id === active} data-dirty={dirty?.(tab.id)} draggable={movableDocument(tab)}
          onContextMenu={event=>{event.preventDefault();onSelect(tab.id);onMenu?.(tab.id)}}
          onDragStart={event => { event.dataTransfer.setData('application/x-eden-workbench-tab', tab.id); event.dataTransfer.effectAllowed = 'move' }}
          onDrop={event => { event.stopPropagation(); drop(event, tab.id) }}>
          <button id={`wb-tab-${encodeURIComponent(tab.id)}`} type="button" role="tab" aria-selected={tab.id === active}
            aria-controls={`wb-panel-${encodeURIComponent(tab.id)}`} tabIndex={tab.id === active ? 0 : -1}
            title={tab.title} onClick={() => onSelect(tab.id)} onKeyDown={event => {
              const index = tabs.findIndex(item => item.id === tab.id)
              const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
              if (next >= 0) { event.preventDefault(); onSelect(tabs[next].id); document.getElementById(`wb-tab-${encodeURIComponent(tabs[next].id)}`)?.focus() }
            }}><Icon size={15} /><span>{tab.pinned?'📌 ':''}{tab.title}</span>{dirty?.(tab.id)&&<span aria-label="未保存修改">●</span>}</button>
          <button type="button" aria-label={`关闭标签 ${tab.title}`} title="关闭标签" onClick={() => onClose(tab.id)}><X size={14} /></button>
        </div>
      })}
      {!tabs.length && <span className="px-4 text-xs text-text-muted">{group === 'main' ? '编辑区' : '辅助区'}</span>}
    </div>
    {toolbar}
    <div className="workbench-layout-actions">{current && movableDocument(current) && <button type="button" className="workbench-icon" aria-label={moveLabel}
      title={moveLabel} onClick={() => onMove(current.id, other)}>
      {other === 'auxiliary' ? <ArrowRightToLine size={16} /> : <ArrowLeftToLine size={16} />}</button>}
    {onSplit&&<><button type="button" className="workbench-icon" aria-label="向右拆分编辑组" onClick={()=>onSplit('horizontal')}>↔</button><button type="button" className="workbench-icon" aria-label="向下拆分编辑组" onClick={()=>onSplit('vertical')}>↕</button></>}
    {onMerge&&<button type="button" className="workbench-icon" aria-label="合并编辑组" onClick={onMerge}><X size={14}/></button>}
    </div>
    {onMenu&&<button type="button" className="workbench-icon workbench-layout-more" aria-label="编辑组操作" title="移动页面、拆分或合并编辑组" onClick={()=>onMenu(current?.id??'')}><MoreHorizontal size={16}/></button>}
  </header>
}
