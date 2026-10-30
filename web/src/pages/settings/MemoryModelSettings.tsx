import { useEffect, useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import type { MemoryModelStatus } from '@eden/api'
import { useRuntimeOrigin } from '../../lib/use-runtime-origin'
import { getRuntimeOriginRevision, getStoredRuntimeOrigin } from '../../lib/runtime-origin'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'

export function MemoryModelSettings() {
  const origin = useRuntimeOrigin()
  const [status, setStatus] = useState<MemoryModelStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    const reload = () => setEpoch(value => value + 1)
    window.addEventListener('edenagent:runtime-origin-changed', reload)
    window.addEventListener('edenagent:account-changed', reload)
    window.addEventListener('storage', reload)
    return () => {
      window.removeEventListener('edenagent:runtime-origin-changed', reload)
      window.removeEventListener('edenagent:account-changed', reload)
      window.removeEventListener('storage', reload)
    }
  }, [])
  useEffect(() => {
    setStatus(null); setError(''); setBusy(false)
    if (origin !== 'local') return
    const revision = getRuntimeOriginRevision()
    let live = true, timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const result = await rpcRequestForOrigin('local', 'memory.model.status', {}, revision)
        if (!live || revision !== getRuntimeOriginRevision()) return
        setStatus(result); setError('')
        if (result.state === 'downloading') timer = setTimeout(() => void poll(), 700)
      } catch (reason) { if (live && revision === getRuntimeOriginRevision()) setError(String(reason)) }
    }
    void poll()
    return () => { live = false; clearTimeout(timer) }
  }, [origin, epoch])

  const change = async (cancel: boolean) => {
    const revision = getRuntimeOriginRevision()
    if (busy || getStoredRuntimeOrigin() !== 'local') return
    setBusy(true); setError('')
    try {
      const result = cancel
        ? await rpcRequestForOrigin('local', 'memory.model.cancel', {}, revision)
        : await rpcRequestForOrigin('local', 'memory.model.download', { confirm: true }, revision)
      if (revision === getRuntimeOriginRevision()) { setStatus(result); setEpoch(value => value + 1) }
    } catch (reason) { if (revision === getRuntimeOriginRevision()) setError(String(reason)) }
    finally { if (revision === getRuntimeOriginRevision()) setBusy(false) }
  }
  if (origin !== 'local') return null
  const downloading = status?.state === 'downloading', ready = status?.state === 'ready'
  const progress = status ? Math.min(100, Math.floor(status.downloadedBytes / status.totalBytes * 100)) : 0
  return (
    <section aria-labelledby="memory-model-title" className="border-t border-border px-2 py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 id="memory-model-title" className="text-sm font-medium text-text">本地记忆模型</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">尘世的记忆检索需单独下载模型，约 96 MB，下载后可离线使用。</p>
        </div>
        <button type="button" disabled={busy || !status || ready} onClick={() => void change(Boolean(downloading))}
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-accent px-3 text-xs text-on-accent disabled:opacity-50">
          {busy || downloading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {ready ? '已下载' : downloading ? '取消下载' : status?.state === 'error' ? '重试下载' : '下载模型'}
        </button>
      </div>
      <p aria-live="polite" className="mt-3 text-xs text-text-muted">{!status ? '正在读取模型状态…' : ready ? '模型已就绪，记忆检索可用。' : downloading ? `正在下载：${progress}%` : '尚未下载，普通聊天仍可使用，暂不检索长期记忆。'}</p>
      {downloading ? <progress aria-label="模型下载进度" value={status!.downloadedBytes} max={status!.totalBytes} className="mt-2 h-1.5 w-full accent-accent" /> : null}
      {error || status?.error ? <p role="alert" className="mt-2 break-words text-xs text-danger">{error || status?.error}</p> : null}
      <div className="mt-3 flex gap-4 text-xs text-text-muted">
        <button type="button" onClick={() => setEpoch(value => value + 1)} className="hover:text-accent">刷新状态</button>
        <a href="https://huggingface.co/BAAI/bge-small-zh-v1.5" target="_blank" rel="noreferrer" className="hover:text-accent">模型来源</a>
      </div>
    </section>
  )
}
