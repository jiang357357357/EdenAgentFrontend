import { useRef, type ReactNode } from 'react'
import type { EditorLayout } from './editor-layout'
import { WorkbenchSeparator } from './WorkbenchSeparator'
export function EditorGrid({ layout, onResize, renderGroup }: { layout:EditorLayout;onResize(id:string,ratio:number):void;renderGroup(id:string):ReactNode }) {
  const root=useRef<HTMLDivElement>(null)
  if(layout.type==='group')return renderGroup(layout.id)
  const vertical=layout.axis==='vertical'
  const measure=()=>vertical?root.current?.clientHeight:root.current?.clientWidth
  return <div ref={root} className="workbench-editor-split" data-axis={layout.axis}>
    <div className="workbench-editor-child" style={{flexGrow:layout.ratio}}><EditorGrid layout={layout.children[0]} onResize={onResize} renderGroup={renderGroup}/></div>
    <WorkbenchSeparator label={vertical?'编辑器分组高度':'编辑器分组宽度'} value={Math.round((measure()??800)*layout.ratio)} min={(measure()??800)*.15} max={(measure()??800)*.85} horizontal={vertical} onChange={value=>onResize(layout.id,value/(measure()??800))}/>
    <div className="workbench-editor-child" style={{flexGrow:1-layout.ratio}}><EditorGrid layout={layout.children[1]} onResize={onResize} renderGroup={renderGroup}/></div>
  </div>
}
