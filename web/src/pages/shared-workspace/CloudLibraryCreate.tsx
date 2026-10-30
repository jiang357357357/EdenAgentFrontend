import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Check, ChevronRight, Cloud, LoaderCircle } from 'lucide-react'
import type { SharedHost } from '../../lib/shared-workspace-client'
import type { SharedWorkspaceStateOwner } from '../../components/shared-workspace/shared-workspace-state'
import { CloudDirectoryPicker } from '../../components/shared-workspace/CloudDirectoryPicker'
import { sharedButtonClass, sharedInputClass, sharedPrimaryButtonClass } from '../../components/shared-workspace/shared-workspace-view'

export function CloudLibraryCreate({ owner, hosts, busy, onCancel, onCreated, onManageHost }: {
  owner: SharedWorkspaceStateOwner; hosts: SharedHost[]; busy: boolean
  onCancel(): void; onCreated(id: string): void; onManageHost(): void
}) {
  const [hostId, setHostId] = useState(owner.state.managementHostId)
  const [source, setSource] = useState('')
  const [sourceHostId, setSourceHostId] = useState('')
  const [name, setName] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [step, setStep] = useState<'folder' | 'confirm'>('folder')
  const reducedMotion = useReducedMotion()
  const host = hosts.find(host => host.deviceId === hostId) ?? hosts[0]
  const chosenSource = sourceHostId === host?.deviceId ? source : ''
  useEffect(() => { setSource(''); setName(''); setConfirmed(false); setStep('folder') }, [owner, host?.deviceId])
  const selectFolder = (path: string) => {
    if (!host) return
    setSourceHostId(host.deviceId)
    setSource(path); setName(previous => previous || (path.split(/[\\/]/).filter(Boolean).at(-1) || '共享资料').slice(0, 120))
    setConfirmed(false); setStep('confirm')
  }
  const create = async () => {
    if (busy || !host || !chosenSource || !name.trim() || !confirmed || !owner.isCurrent()) return
    const result = await owner.create(name, host.deviceId, chosenSource)
    if (result && owner.isCurrent()) onCreated(result.space.id)
  }
  return <motion.section key={step} initial={reducedMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="mx-auto max-w-3xl space-y-6" aria-label="创建云端资料库"
    onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel() } }}>
    <button type="button" className="inline-flex items-center gap-2 text-sm text-accent hover:underline disabled:opacity-40" disabled={busy} onClick={onCancel}><ArrowLeft className="h-4 w-4" />返回资料库</button>
    <div><h2 className="text-2xl font-semibold">新建云端资料库</h2><p className="mt-2 text-sm text-text-muted">{step === 'folder' ? '先选择云主机上要共享的文件夹。' : '核对名称和文件夹，确认后开始共享。'}</p></div>
    <ol className="flex items-center gap-3 text-sm" aria-label="创建步骤">
      <li className="flex items-center gap-2 font-medium text-accent" aria-current={step === 'folder' ? 'step' : undefined}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-on-accent">{step === 'confirm' ? <Check className="h-4 w-4" /> : '1'}</span>选择文件夹</li>
      <ChevronRight className="h-4 w-4 text-text-muted" />
      <li className={`flex items-center gap-2 ${step === 'confirm' ? 'font-medium text-accent' : 'text-text-muted'}`} aria-current={step === 'confirm' ? 'step' : undefined}><span className={`flex h-7 w-7 items-center justify-center rounded-full border ${step === 'confirm' ? 'border-accent bg-accent text-on-accent' : 'border-border'}`}>2</span>确认共享</li>
    </ol>
    <div className="flex flex-wrap items-center gap-3 text-sm"><Cloud className="h-5 w-5 shrink-0 text-accent" /><label className="flex min-w-0 flex-1 items-center gap-3"><span className="shrink-0 text-text-muted">云主机</span>
      <select aria-label="新资料库主机" className={`${sharedInputClass} max-w-sm`} value={host?.deviceId ?? ''} disabled={busy || !hosts.length}
        onChange={event => { setHostId(event.target.value); setSource(''); setName(''); setConfirmed(false); setStep('folder'); owner.clearFeedback() }}>{hosts.map(host => <option key={host.deviceId} value={host.deviceId}>{host.name}</option>)}</select></label></div>
    {!host || host.directorySources !== true ? <div className="space-y-4 border-y border-border py-7">
      <h3 className="font-medium">{host ? '云主机共享服务需要更新' : '先连接可管理的云主机'}</h3>
      <p className="text-sm leading-relaxed text-text-muted">{host ? '此主机尚未支持文件夹浏览，请在云主机管理中更新共享服务，已有资料与身份会保留。' : '连接或部署云主机后，再选择文件夹创建资料库。'}</p>
      <button type="button" className={sharedPrimaryButtonClass} disabled={busy} onClick={onManageHost}>前往云主机管理</button>
    </div> : step === 'folder' ? <>
      <CloudDirectoryPicker key={host.deviceId} owner={owner} hostId={host.deviceId} disabled={busy} embedded initialPath={chosenSource || undefined} onSelect={selectFolder} />
      <p className="text-xs text-text-muted">下一步确认名称与共享范围，确认前不会创建资料库。</p>
    </> : <form className="space-y-6" onSubmit={event => { event.preventDefault(); void create() }}>
      <label className="block space-y-2 text-sm"><span className="font-medium">资料库名称</span><input aria-label="新资料库名称" autoFocus value={name} maxLength={120} className={sharedInputClass} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      <div className="space-y-2 border-y border-border/70 py-5"><p className="text-sm text-text-muted">云端共享文件夹</p><p className="break-all font-mono text-sm">{chosenSource}</p>
        <button type="button" className="text-sm text-accent hover:underline disabled:opacity-40" disabled={busy} onClick={() => { setStep('folder'); setConfirmed(false) }}>重新选择文件夹</button></div>
      <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-accent" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /><span>确认将所选云端目录共享给资料库成员，并接收已授权成员的修改。</span></label>
      <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-5"><button type="button" className={sharedButtonClass} disabled={busy} onClick={() => { setStep('folder'); setConfirmed(false) }}>上一步</button>
        <button type="submit" className={`${sharedPrimaryButtonClass} ml-auto inline-flex items-center gap-2`} disabled={busy || !chosenSource || !name.trim() || !confirmed}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{busy ? '正在创建…' : '创建资料库'}</button></div>
      <p className="text-xs text-text-muted">创建后可设置成员权限。本机同步目录可以稍后选择。</p>
    </form>}
    {step === 'folder' ? <button type="button" className="text-sm text-text-muted hover:text-text disabled:opacity-40" disabled={busy} onClick={onCancel}>取消新建</button> : null}
  </motion.section>
}
