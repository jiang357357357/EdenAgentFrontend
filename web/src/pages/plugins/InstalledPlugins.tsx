import { useEffect, useId, useState } from 'react'
import { ArrowLeft, Package, Search, Trash2 } from 'lucide-react'
import { enablePlugin, setPluginPermissions, uninstallPlugin, type Plugin } from '../../lib/agent-client'
import { PluginComponents } from './PluginComponents'
import { McpPanel } from '../../components/chat/McpPanel'
import type { PluginActionRunner } from './plugin-page-types'
const kindLabels:Record<string,string>={ui:'交互界面',mcp_stdio:'本地服务',mcp_http:'远程服务',skill:'技能',hook:'钩子'}
const detailTabs=[['overview','概览'],['components','组件与版本'],['permissions','权限'],['runtime','运行状态']] as const
function PluginDetails({plugin,busy,run,onChanged,onBack,active}:{plugin:Plugin;busy:boolean;run:PluginActionRunner;onChanged():Promise<void>;onBack():void;active:boolean}) {
  const [tab,setTab]=useState<(typeof detailTabs)[number][0]>('overview'),id=useId()
  const grants=new Map(plugin.permissionGrants.map(grant=>[`${grant.capability}\0${grant.resource}\0${grant.access}`,grant.decision]))
  return <article className="plugin-detail" aria-label={`插件详情 ${plugin.name}`}><header className="plugin-detail-header">
    <button className="plugin-detail-back" onClick={onBack}><ArrowLeft size={16}/>返回插件列表</button>
    <div className="plugin-view-heading"><div><h2>{plugin.name}</h2><p className="plugin-metadata">{plugin.id} · {plugin.version}</p></div><span className="plugin-status" data-enabled={plugin.enabled}>{plugin.enabled?'已启用':'已停用'}</span></div>
    <p className="plugin-detail-description">{plugin.description}</p><div className="plugin-detail-actions"><button className="plugin-primary-action" disabled={busy} onClick={()=>void run(()=>enablePlugin(plugin.id,!plugin.enabled))}>{plugin.enabled?'停用':'启用'}</button>
      <button className="plugin-uninstall" disabled={busy} onClick={()=>void run(()=>uninstallPlugin(plugin.id))}><Trash2 size={15}/>卸载</button></div></header>
    <nav className="plugin-detail-tabs" role="tablist" aria-label="插件详情分类">{detailTabs.map(([key,label])=><button type="button" key={key} id={`${id}-${key}`} role="tab" aria-selected={tab===key} aria-controls={`${id}-panel`} onClick={()=>setTab(key)}>{label}{key==='permissions'&&plugin.permissions.length>0?` (${plugin.permissions.length})`:''}</button>)}</nav>
    <div className="plugin-detail-content surface-scrollbars" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
      {tab==='overview'&&<><h3>插件信息</h3><dl className="plugin-info"><dt>来源</dt><dd>{plugin.sourceType==='local'?'本地安装':plugin.sourceType==='marketplace'?'插件市场':plugin.sourceType}</dd><dt>签名</dt><dd title={plugin.trustState}>{plugin.trustState.startsWith('verified:')?'已验证签名':'未验证签名'}</dd><dt>组件</dt><dd>{plugin.components.length} 个</dd></dl>
        <p className="plugin-view-description">“已启用”表示插件开关已开启；后台是否连接成功请查看“运行状态”。</p>
        <ul className="plugin-component-summary">{plugin.components.map(component=><li key={component.id}><span>{kindLabels[component.kind]||component.kind}</span><span className="plugin-metadata">{component.id} · {(component.enabled??component.enabledByDefault)?'已启用':'未启用'}</span></li>)}</ul>
        {plugin.uiContributions.filter(item=>item.location==='plugin_detail').map(item=><section key={`${item.componentId}:${item.id}`} className="plugin-contribution"><h3>{item.title}</h3><p>{item.body}</p></section>)}</>}
      {tab==='components'&&<><h3>组件与版本</h3>{(plugin.sourceType==='local'||plugin.sourceType==='marketplace')?<PluginComponents key={plugin.revision} plugin={plugin} onChanged={onChanged}/>:<p className="plugin-view-empty">此来源不支持包组件管理。</p>}</>}
      {tab==='permissions'&&<><h3>声明权限</h3><p className="plugin-view-description">插件代码按当前系统账户权限运行。这里管理宿主调用的授权与审批，不提供操作系统沙箱隔离。</p>
        {plugin.permissions.map(permission=>{const key=`${permission.capability}\0${permission.resource}\0${permission.access}`;return <label className="plugin-permission" key={key}>
          <input type="checkbox" disabled={busy} checked={grants.get(key)==='allowed'} onChange={event=>{const checked=event.target.checked;void run(()=>setPluginPermissions(plugin.id,plugin.revision,plugin.permissions.map(item=>({capability:item.capability,resource:item.resource,access:item.access,decision:item===permission?(checked?'allowed':'denied'):(grants.get(`${item.capability}\0${item.resource}\0${item.access}`)??'denied')}))))}}/>
          <span>{permission.description}<small>{permission.capability} · {permission.access} · {permission.resource}</small></span>{permission.required&&<b>必需</b>}</label>})}{!plugin.permissions.length&&<p className="plugin-view-empty">此插件没有声明额外权限。</p>}</>}
      {tab==='runtime'&&<><h3>运行状态</h3>{plugin.components.some(component=>component.kind==='mcp_stdio'||component.kind==='mcp_http')?active&&<McpPanel key={plugin.revision} pluginId={plugin.id} defaultOpen/>:<p className="plugin-view-empty">此插件没有声明独立后端服务。</p>}</>}
    </div></article>
}
export function InstalledPlugins({plugins,loading,busy,run,onChanged,active,focus}:{plugins:Plugin[];loading:boolean;busy:boolean;run:PluginActionRunner;onChanged():Promise<void>;active:boolean;focus?:{id:string;revision:number}}) {
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState(''),[detailOpen,setDetailOpen]=useState(false)
  useEffect(()=>{if(focus){setSearch('');setFilter('all');setSelected(focus.id);setDetailOpen(true)}},[focus])
  const needle=search.trim().toLocaleLowerCase(),filtered=plugins.filter(plugin=>(filter==='all'||plugin.enabled===(filter==='enabled'))&&(!needle||`${plugin.name}\n${plugin.id}\n${plugin.description}`.toLocaleLowerCase().includes(needle)))
  const current=filtered.find(plugin=>plugin.id===selected)??filtered[0]
  return <div className="plugin-installed"><div className="plugin-list-toolbar"><label className="plugin-search"><Search size={16}/><input type="search" aria-label="搜索已安装插件" placeholder="搜索名称、ID 或描述" value={search} onChange={event=>{setSearch(event.target.value);setDetailOpen(false)}}/></label>
    <div className="plugin-filters" role="group" aria-label="插件状态筛选">{[['all','全部',plugins.length],['enabled','已启用',plugins.filter(p=>p.enabled).length],['disabled','已停用',plugins.filter(p=>!p.enabled).length]].map(([key,label,count])=><button key={key} aria-pressed={filter===key} onClick={()=>{setFilter(String(key));setDetailOpen(false)}}>{label} <span>{count}</span></button>)}</div></div>
    <div className="plugin-installed-layout" data-detail-open={detailOpen}><div className="plugin-list surface-scrollbars" aria-label="已安装插件列表">
      {loading&&!plugins.length?<p className="plugin-view-empty" role="status">正在读取插件…</p>:!filtered.length?<p className="plugin-view-empty" role="status">{plugins.length?'没有符合条件的插件':'尚未安装插件，请从“安装插件”开始。'}</p>:filtered.map(plugin=><button key={plugin.id} data-plugin-id={plugin.id} aria-pressed={current?.id===plugin.id} onClick={()=>{setSelected(plugin.id);setDetailOpen(true)}}><Package size={21}/><span><strong>{plugin.name}</strong><small>{plugin.version} · {plugin.enabled?'已启用':'已停用'}</small><small className="plugin-list-description">{plugin.description}</small></span></button>)}</div>
      {current?<PluginDetails key={current.id} plugin={current} busy={busy} run={run} onChanged={onChanged} active={active} onBack={()=>setDetailOpen(false)}/>:<div className="plugin-detail plugin-view-empty">从列表选择插件查看详情。</div>}</div>
  </div>
}
