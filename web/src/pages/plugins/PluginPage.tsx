import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Code, History, Package, PackagePlus, RefreshCw, Store } from 'lucide-react'
import { motion } from 'motion/react'
import type { PluginPreviewInfo } from '@eden/api'
import { pageEnterMotion } from '../../lib/page-motion'
import { listPlugins, type Plugin } from '../../lib/agent-client'
import { getRuntimeOriginRevision } from '../../lib/runtime-origin'
import { JobOutcomeReview } from '../../components/chat/JobOutcomeReview'
import { InstalledPlugins } from './InstalledPlugins'
import { PluginInstaller } from './PluginInstaller'
import { PluginMarket } from './PluginMarket'
import { PluginDevelopment } from './PluginDevelopment'
import { PluginRecovery } from './PluginRecovery'
import './plugin-management.css'

const sections=[['installed','已安装',Package],['install','安装插件',PackagePlus],['market','插件市场',Store],['development','开发',Code],['recovery','恢复',History]] as const
type View=(typeof sections)[number][0]
export function PluginPage({ onBack }: { onBack():void }) {
  const [plugins,setPlugins]=useState<Plugin[]>([]),[view,setView]=useState<View>('installed'),[visited,setVisited]=useState<View[]>(['installed'])
  const [preview,setPreview]=useState<PluginPreviewInfo|null>(null),[focus,setFocus]=useState<{id:string;revision:number}>()
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const mounted=useRef(true),request=useRef(0),locked=useRef(false),id=useId()
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current++}},[])
  const refresh=useCallback(async()=>{
    const sequence=++request.current,origin=getRuntimeOriginRevision();setLoading(true)
    try{const values=await listPlugins();if(mounted.current&&sequence===request.current&&origin===getRuntimeOriginRevision())setPlugins(values)}
    finally{if(mounted.current&&sequence===request.current)setLoading(false)}
  },[])
  useEffect(()=>{void refresh().catch(reason=>{if(mounted.current)setError(String(reason))})},[refresh])
  const run=async(action:()=>Promise<unknown>)=>{
    if(locked.current)return false
    locked.current=true;setBusy(true);setError('')
    try{await action();await refresh();return true}
    catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:String(reason));return false}
    finally{locked.current=false;if(mounted.current)setBusy(false)}
  }
  const choose=(next:View)=>{setView(next);setVisited(current=>current.includes(next)?current:[...current,next])}
  const inspect=(value:PluginPreviewInfo)=>{setPreview(value);choose('install')}
  return <motion.main {...pageEnterMotion} className="plugin-management theme-page bg-bg text-text">
    <header className="plugin-management-header"><button aria-label="返回" onClick={onBack}><ArrowLeft size={18}/></button><div><h1>插件管理</h1><p>{plugins.length} 个已安装插件</p></div>
      <button aria-label="刷新插件列表" disabled={loading||busy} onClick={()=>{setError('');void refresh().catch(reason=>setError(String(reason)))}}><RefreshCw size={16} className={loading?'animate-spin':''}/><span>刷新</span></button></header>
    <nav className="plugin-management-nav surface-scrollbars" role="tablist" aria-label="插件管理分类">{sections.map(([key,label,Icon])=><button key={key} id={`${id}-${key}`} role="tab" aria-selected={view===key} aria-controls={`${id}-${key}-panel`} onClick={()=>choose(key)}><Icon size={16}/>{label}</button>)}</nav>
    {error&&<div role="alert" className="plugin-page-error">{error}</div>}
    <div className="plugin-management-content">{visited.map(key=><section key={key} id={`${id}-${key}-panel`} role="tabpanel" aria-labelledby={`${id}-${key}`} hidden={view!==key} className="plugin-management-section surface-scrollbars" data-section={key}>
      {key==='installed'&&<InstalledPlugins plugins={plugins} loading={loading} busy={busy} run={run} onChanged={refresh} active={view===key} focus={focus}/>}
      {key==='install'&&<PluginInstaller preview={preview} onPreview={setPreview} busy={busy} run={run} onInstalled={pluginId=>{setFocus(current=>({id:pluginId,revision:(current?.revision??0)+1}));choose('installed')}}/>}
      {key==='market'&&<PluginMarket busy={busy} run={run} onPreview={inspect} onChanged={refresh}/>}
      {key==='development'&&<div className="plugin-settings-view"><PluginDevelopment onChanged={refresh}/></div>}
      {key==='recovery'&&<div className="plugin-settings-view"><h2>插件恢复</h2><p className="plugin-view-description">检查迁移副本和未确认的插件钩子作业，按实际结果继续处理。</p><PluginRecovery disabled={busy||Boolean(preview)} onPreview={inspect}/><JobOutcomeReview kind="plugin.hook" title="插件钩子作业恢复"/></div>}
    </section>)}</div>
  </motion.main>
}