import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import type { PluginPreviewInfo } from '@eden/api'
import { addPluginMarketSource, inspectPluginMarketRelease, listPluginMarketReleases, listPluginMarketSources, refreshPluginMarketSource, removePluginMarketSource, type PluginMarketRelease, type PluginMarketSource } from '../../lib/agent-client'
import { PluginMarketKeys } from './PluginMarketKeys'
import type { PluginActionRunner } from './plugin-page-types'
export function PluginMarket({ busy, run, onPreview, onChanged }: { busy:boolean;run:PluginActionRunner;onPreview(value:PluginPreviewInfo):void;onChanged():Promise<void> }) {
  const [sources,setSources]=useState<PluginMarketSource[]>([]),[releases,setReleases]=useState<PluginMarketRelease[]>([])
  const [form,setForm]=useState({id:'',name:'',url:'',keyID:''}),[error,setError]=useState('')
  const refresh=useCallback(async()=>{try{const [sources,releases]=await Promise.all([listPluginMarketSources(),listPluginMarketReleases()]);setSources(sources);setReleases(releases);setError('')}catch(reason){setError(`无法读取插件市场：${String(reason)}`)}},[])
  useEffect(()=>{void refresh()},[refresh])
  const change=(action:()=>Promise<unknown>)=>run(async()=>{await action();await refresh()})
  return <div className="plugin-settings-view"><div className="plugin-view-heading"><h2>插件市场</h2><button aria-label="刷新插件市场" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16}/>刷新</button></div>
    <p className="plugin-view-description">从已验证的签名来源浏览插件，选择版本后进入安装预览。</p>{error&&<p role="alert" className="plugin-error">{error}</p>}
    <section aria-label="可安装版本" className="plugin-market-releases">{releases.map(release=><article key={`${release.sourceID}:${release.pluginID}:${release.version}`}>
      <div className="plugin-view-heading"><h3>{release.name}</h3><span>{release.version}</span></div><p className="plugin-view-description">{release.revocationReason??release.description}</p><p className="plugin-metadata">来源：{release.sourceID}{release.revoked?' · 已撤销':''}</p>
      <button disabled={busy||release.revoked} onClick={()=>void run(async()=>onPreview(await inspectPluginMarketRelease(release.sourceID,release.pluginID,release.version)))}>下载并审查</button></article>)}
      {!releases.length&&<p className="plugin-view-empty">暂无可安装的市场版本，可在下方添加签名来源。</p>}</section>
    <details className="plugin-market-sources"><summary>管理市场来源（{sources.length}）</summary><div className="plugin-source-fields">
      {([['id','来源 ID'],['name','显示名称'],['url','HTTPS 索引 URL'],['keyID','可信密钥 ID']] as const).map(([key,label])=><label className="plugin-field" key={key}>{label}<input aria-label={label} value={form[key]} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}</div>
      <button disabled={busy||Object.values(form).some(value=>!value.trim())} onClick={()=>void change(async()=>{await addPluginMarketSource(form);await refreshPluginMarketSource(form.id);setForm({id:'',name:'',url:'',keyID:''})})}>添加并验证来源</button>
      {sources.map(source=><div className="plugin-market-source" key={source.id}><div><b>{source.name}</b><p className="plugin-metadata">{source.url} · {source.keyID}</p>{source.lastError&&<p className="plugin-error">{source.lastError}</p>}</div>
        <button disabled={busy} aria-label={`刷新来源 ${source.name}`} onClick={()=>void change(()=>refreshPluginMarketSource(source.id))}><RefreshCw size={15}/></button><button disabled={busy} aria-label={`移除来源 ${source.name}`} onClick={()=>void change(()=>removePluginMarketSource(source.id))}><Trash2 size={15}/></button></div>)}</details>
    <PluginMarketKeys onChanged={async()=>{await refresh();await onChanged()}}/>
  </div>
}
