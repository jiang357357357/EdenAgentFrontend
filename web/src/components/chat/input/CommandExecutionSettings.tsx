import { useEffect, useState } from 'react'
import type { TerminalInfo, TerminalTarget } from '@eden/api'
import { rpcRequestForOrigin } from '../../../lib/rpc-transport'
import { useRuntimeOrigin } from '../../../lib/use-runtime-origin'

function targetKey(target: TerminalTarget): string { return target.kind === 'host' ? 'host' : `wsl:${target.distribution}` }
function targetFromKey(key: string): TerminalTarget {
  return key === 'host' ? { kind: 'host' } : { kind: 'wsl', distribution: key.slice(4) }
}
function targetLabel(target: TerminalTarget, platform: string): string {
  return target.kind === 'host' ? (platform === 'win32' ? '本机 PowerShell' : '本机 /bin/sh') : `WSL · ${target.distribution}`
}

export function CommandExecutionSettings({ sessionId }: { sessionId?: string }) {
  const origin = useRuntimeOrigin()
  return <ScopedCommandExecutionSettings key={`${origin}:${sessionId ?? ''}`} origin={origin} sessionId={sessionId} />
}

function ScopedCommandExecutionSettings({ origin, sessionId }: { origin: 'mon' | 'local'; sessionId?: string }) {
  const [info, setInfo] = useState<TerminalInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    rpcRequestForOrigin(origin, 'command.terminal.get', { ...(sessionId ? { sessionId } : {}) })
      .then(value => { if (active) setInfo(value) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [origin, sessionId, reload])

  async function save(scope: 'device' | 'session', key: string) {
    setSaving(true)
    setError('')
    try {
      if (scope === 'device') await rpcRequestForOrigin(origin, 'command.terminal.set', { scope, target: targetFromKey(key) })
      else if (sessionId) await rpcRequestForOrigin(origin, 'command.terminal.set', {
        scope, sessionId, target: key === 'inherit' ? null : targetFromKey(key),
      })
      setInfo(await rpcRequestForOrigin(origin, 'command.terminal.get', { ...(sessionId ? { sessionId } : {}) }))
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setSaving(false) }
  }

  const choices: TerminalTarget[] = info?.platform === 'win32'
    ? [{ kind: 'host' }, ...info.wslDistributions.map(distribution => ({ kind: 'wsl' as const, distribution }))]
    : [{ kind: 'host' }]
  const missingTargets = [info?.deviceDefault, info?.sessionOverride].filter((target): target is TerminalTarget =>
    Boolean(target && !choices.some(choice => targetKey(choice) === targetKey(target))))
    .filter((target, index, values) => values.findIndex(value => targetKey(value) === targetKey(target)) === index)
  choices.push(...missingTargets)

  return (
    <section className="border-t border-current/15 px-3 py-3 text-xs" aria-label="终端环境">
      <p className="mb-2 font-medium">终端环境</p>
      {loading && <p role="status">正在读取终端…</p>}
      {error && <p role="alert" className="mb-2 text-danger">{error}</p>}
      {!loading && !info && <button type="button" className="underline" onClick={() => setReload(value => value + 1)}>重新读取</button>}
      {info && <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block opacity-80">这台设备默认</span>
          <select className="w-full rounded border border-current/20 bg-card px-2 py-1.5 text-text" value={targetKey(info.deviceDefault)}
            disabled={saving || choices.length <= 1} onChange={event => void save('device', event.target.value)}>
            {choices.map(target => <option key={targetKey(target)} value={targetKey(target)}>{targetLabel(target, info.platform)}</option>)}
          </select>
        </label>
        {sessionId && <label className="block">
          <span className="mb-1 block opacity-80">当前会话</span>
          <select className="w-full rounded border border-current/20 bg-card px-2 py-1.5 text-text"
            value={info.sessionOverride ? targetKey(info.sessionOverride) : 'inherit'} disabled={saving}
            onChange={event => void save('session', event.target.value)}>
            <option value="inherit">跟随设备默认</option>
            {choices.map(target => <option key={targetKey(target)} value={targetKey(target)}>{targetLabel(target, info.platform)}</option>)}
          </select>
        </label>}
        <p role="status" className="opacity-80">当前命令：{targetLabel(info.effective, info.platform)}</p>
        {!info.hostAvailable && info.effective.kind === 'host' && <p className="text-danger">本机终端当前不可用。</p>}
        {info.platform === 'win32' && info.wslDistributions.length === 0 && <p className="opacity-70">未检测到已安装的 WSL 发行版。</p>}
        {missingTargets.length > 0 && <p className="text-danger">已选发行版当前不可用，请重新选择。</p>}
        <p className="opacity-70">WSL 使用当前 Windows 账户可启动的发行版及其默认 Linux 用户；这里不启用沙箱。</p>
      </div>}
    </section>
  )
}
