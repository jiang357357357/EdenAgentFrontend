interface PreparedWindow { window: Window; timer?: ReturnType<typeof setTimeout>; prepareClose?:()=>void }
const prepared=new Map<string,PreparedWindow>()
if(typeof window!=='undefined')window.addEventListener('pagehide',()=>{
  for(const entry of prepared.values()){clearTimeout(entry.timer);entry.prepareClose?.();entry.window.close()}
  prepared.clear()
})
export function preparePluginWindow(id:string):Window|null {
  const existing=prepared.get(id)
  if(existing&&!existing.window.closed){existing.window.focus();return existing.window}
  if(existing){clearTimeout(existing.timer);prepared.delete(id)}
  for(const [key,entry] of prepared)if(entry.window.closed){clearTimeout(entry.timer);prepared.delete(key)}
  if(prepared.size>=8)return null
  const popup=window.open(new URL('extension-window.html',document.baseURI).href,'eden-plugin-'+crypto.randomUUID(),'popup,width=1000,height=720')
  if(!popup)return null
  const timer=setTimeout(()=>{if(prepared.get(id)?.window===popup){prepared.delete(id);popup.close()}},15000)
  prepared.set(id,{window:popup,timer});return popup
}
export function claimPluginWindow(id:string) {
  const popup=preparePluginWindow(id),entry=prepared.get(id)
  if(entry){clearTimeout(entry.timer);entry.timer=undefined}
  return popup
}
export function preparePluginWindowClose(id:string,callback:()=>void){const entry=prepared.get(id);if(entry)entry.prepareClose=callback}
export function releasePluginWindow(id:string,popup:Window){
  const entry=prepared.get(id)
  if(entry?.window!==popup){popup.close();return}
  // React development replay must be able to reclaim the same popup without opening another window.
  clearTimeout(entry.timer)
  entry.timer=setTimeout(()=>{if(prepared.get(id)===entry){prepared.delete(id);popup.close()}},100)
}
export async function pluginWindowMount(popup:Window,signal:AbortSignal) {
  const end=Date.now()+10000
  while(popup.location.pathname.split('/').at(-1)!=='extension-window.html'||!(popup as Window & {__edenExtensionWindowReady?:boolean}).__edenExtensionWindowReady) {
    signal.throwIfAborted()
    if(popup.closed||Date.now()>end)throw new Error('浮动窗口未能加载')
    await new Promise(resolve=>setTimeout(resolve,25))
  }
  signal.throwIfAborted()
  const target=popup.document.createElement('div');target.className='h-screen w-screen overflow-hidden bg-bg text-text';popup.document.body.append(target)
  const styles:Node[]=[]
  for(const style of document.querySelectorAll('style,link[rel="stylesheet"]')){const copy=style.cloneNode(true);styles.push(copy);popup.document.head.append(copy)}
  const sync=()=>{
    popup.document.documentElement.className=document.documentElement.className
    popup.document.documentElement.setAttribute('style',document.documentElement.getAttribute('style')??'')
    for(const name of ['data-theme','data-color-mode']){const value=document.documentElement.getAttribute(name);if(value)popup.document.documentElement.setAttribute(name,value);else popup.document.documentElement.removeAttribute(name)}
  }
  sync();const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true})
  signal.addEventListener('abort',()=>{observer.disconnect();target.remove();styles.forEach(style=>style.parentNode?.removeChild(style))},{once:true})
  return target
}
