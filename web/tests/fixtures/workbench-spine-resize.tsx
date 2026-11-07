import { useReducer } from 'react'
import { createRoot } from 'react-dom/client'
import { Workbench } from '../../src/components/workbench/Workbench'
import { initialWorkbench, workbenchReducer } from '../../src/components/workbench/workbench-state'
import { SpineCharacterCanvas } from '../../src/components/character/renderer/spine/SpineCharacterCanvas'

declare global { interface Window { __spineApp: any; __spineInstances: number; __ready: boolean; __assetBase: string; resizeProbe: any } }
localStorage.setItem('agent.runtime_origin','local')
window.__spineInstances=0;window.__ready=false
const asset={id:'resize-fixture',layout:'standee' as const,costume_key:'fixture',skeleton_url:window.__assetBase+'/arona_spr.skel',atlas_url:window.__assetBase+'/arona_spr.atlas',textures:[{page_name:'arona_spr.png',file_url:window.__assetBase+'/arona_spr.png'}],metadata:{}}
function Workspace(){
  const [state,dispatch]=useReducer(workbenchReducer,undefined,()=>({...initialWorkbench(),
    layout:{type:'split' as const,id:'split:editor-1',axis:'horizontal' as const,ratio:.5,children:[{type:'group' as const,id:'main'},{type:'group' as const,id:'editor-1'}] as [any,any]},nextGroup:2,
    tabs:[{id:'first',kind:'chat' as const,sessionId:'first',title:'First',group:'main'},{id:'second',kind:'chat' as const,sessionId:'second',title:'Second',group:'editor-1'},{id:'portrait',kind:'page' as const,page:'character',title:'Spine',group:'auxiliary'}],
    active:{main:'first','editor-1':'second',auxiliary:'portrait',panel:null},sideWidth:340,
  }))
  return <div style={{position:'fixed',inset:0}}><Workbench state={state} dispatch={dispatch} sidebar={<div>Navigation</div>} sessionId="" running={false}
    onSelect={id=>dispatch({type:'select',id})} onNewChat={()=>{}} onOpenPlugin={()=>{}} renderChat={()=> <p>Resize acceptance</p>}
    portrait={<SpineCharacterCanvas asset={asset as any} className="h-full w-full" onReady={()=>{window.__ready=true}} onError={error=>{throw error}}/>}/></div>
}
createRoot(document.getElementById('root')!).render(<Workspace/>);

window.resizeProbe={pending:false,resizes:0,renders:0,blankResizes:0,paintedResizes:0,visibilityChanges:0,compacts:[] as boolean[],parentChanges:0}
const start=()=>{
  const app=window.__spineApp,canvas=app.view as HTMLCanvasElement,host=canvas.parentElement!,surface=host.closest('.workbench-surface')!,probe=window.resizeProbe
  const resize=app.renderer.resize.bind(app.renderer),render=app.render.bind(app)
  app.renderer.resize=(...args:any[])=>{probe.pending=true;probe.resizes++;return resize(...args)}
  app.render=()=>{const value=render();probe.pending=false;probe.renders++;return value}
  let buffer=new Uint8Array(0),parent=surface.parentElement
  const observer=new ResizeObserver(()=>{
    if(!window.__ready||host.clientWidth<=0||host.clientHeight<=0)return
    const gl=app.renderer.gl,w=gl.drawingBufferWidth,h=gl.drawingBufferHeight
    if(buffer.length!==w*h*4)buffer=new Uint8Array(w*h*4)
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buffer)
    let alpha=0;for(let i=3;i<buffer.length;i+=4)if(buffer[i])alpha++
    if(probe.pending&&alpha===0)probe.blankResizes++
    else if(alpha>0)probe.paintedResizes++
  });observer.observe(host)
  const mutations=new MutationObserver(records=>{
    probe.visibilityChanges+=records.filter(record=>record.target===surface&&record.attributeName==='hidden').length
    if(surface.parentElement!==parent){probe.parentChanges++;parent=surface.parentElement}
    const compact=document.querySelector('.workbench-shell')?.getAttribute('data-compact')==='true'
    if(probe.compacts.at(-1)!==compact)probe.compacts.push(compact)
  });mutations.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','data-compact']})
  ;(window as any).__resizeObservers=[observer,mutations]
  return true
}
;(window as any).startResizeProbe=start
;(window as any).separatorPoint=(name:string)=>{const element=document.querySelector(`[role=separator][aria-label="${name}"]`)!,r=element.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}}
;(window as any).dragDivider=async(name:string,deltas:number[])=>{
  const element=document.querySelector<HTMLElement>(`[role=separator][aria-label="${name}"]`)!,r=element.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2
  // Hidden offscreen windows cannot own OS pointer capture. Control that input
  // boundary only; dispatch through the production React separator handlers.
  const capture=element.setPointerCapture,release=element.releasePointerCapture
  element.setPointerCapture=()=>{};element.releasePointerCapture=()=>{}
  const fire=(type:string,delta:number)=>element.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:99,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:x+delta,clientY:y}))
  try{fire('pointerdown',0);for(const delta of deltas){fire('pointermove',delta);await new Promise(resolve=>setTimeout(resolve,22));const compact=document.querySelector('.workbench-shell')?.getAttribute('data-compact')==='true';if(window.resizeProbe.compacts.at(-1)!==compact)window.resizeProbe.compacts.push(compact)}fire('pointerup',deltas.at(-1)??0)}
  finally{element.setPointerCapture=capture;element.releasePointerCapture=release}
}
