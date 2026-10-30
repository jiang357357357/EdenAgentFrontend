import { CloudUpload } from 'lucide-react'
import type { SharedWorkspaceStateOwner } from './shared-workspace-state'
import { useSharedHostForm } from './use-shared-host-form'
import { sharedButtonClass, sharedInputClass, sharedPrimaryButtonClass } from './shared-workspace-view'

export function SharedHostDeployment({ owner, busy }: { owner: SharedWorkspaceStateOwner; busy: boolean }) {
  const form = useSharedHostForm(owner), job = owner.state.deployment
  const disabled = busy || form.pending || job?.state === 'running'
  const field = (key: keyof typeof form.fields, label: string, placeholder?: string) => <label className="block space-y-1 text-sm">
    <span>{label}</span><input aria-label={label} className={sharedInputClass} value={form.fields[key]} disabled={disabled}
      onChange={event => form.setField(key, event.target.value)} placeholder={placeholder} autoComplete="off" /></label>
  return <section aria-label="SSH 部署共享主机" className="space-y-4 rounded-xl border border-border/70 bg-library-card p-5 sm:p-6">
    <div><h2 className="flex items-center gap-2 text-base font-semibold"><CloudUpload className="h-5 w-5 text-accent" />部署到云服务器</h2>
      <p className="mt-2 text-sm text-text-muted">通过 SSH 上传并启动独立共享服务，部署后自动连接。本机成为管理员，其他子机通过主机地址和邀请连接。</p></div>
    <p className="text-xs leading-relaxed text-text-muted">支持可通过 SSH 登录的 x64 / ARM64 Linux。程序自动上传并安装 Node.js 和 MonPM，无需预装依赖或在云端联网下载。请放行共享端口，默认 TCP 40195。SSH 凭据仅用于本次部署。</p>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void form.deploy() }}>
      <div className="grid gap-3 sm:grid-cols-3">
        {field('host', 'SSH IP 或域名', '例如 203.0.113.10')}{field('port', 'SSH 端口')}{field('username', 'SSH 用户名')}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={sharedButtonClass} disabled={disabled || !form.fields.host.trim() || !form.fields.username.trim()} onClick={() => void form.probe()}>读取 SSH 主机指纹</button>
        {form.fingerprint ? <code className="break-all text-xs">{form.fingerprint}</code> : null}
      </div>
      {form.fingerprint ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={form.trusted} disabled={disabled} onChange={event => form.setTrusted(event.target.checked)} />
        <span>已与云服务器控制台中的 SSH 主机指纹核对，信任此主机。</span></label> : null}
      <label className="block space-y-1 text-sm"><span>SSH 认证方式</span>
        <select aria-label="SSH 认证方式" value={form.authType} disabled={disabled} className={sharedInputClass} onChange={event => form.setAuthType(event.target.value as 'password' | 'key')}>
          <option value="password">密码</option><option value="key">私钥</option>
        </select></label>
      {form.authType === 'password' ? <label className="block space-y-1 text-sm"><span>SSH 密码</span>
        <input aria-label="SSH 密码" type="password" autoComplete="new-password" value={form.password} disabled={disabled} className={sharedInputClass} onChange={event => form.setPassword(event.target.value)} /></label>
        : <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm"><span>SSH 私钥内容</span><textarea aria-label="SSH 私钥内容" autoComplete="off" value={form.privateKey} disabled={disabled}
            className={`${sharedInputClass} min-h-24 font-mono text-xs`} onChange={event => form.setPrivateKey(event.target.value)} /></label>
          <label className="block space-y-1 text-sm"><span>私钥口令（可选）</span><input aria-label="私钥口令" type="password" autoComplete="new-password" value={form.passphrase} disabled={disabled}
            className={sharedInputClass} onChange={event => form.setPassphrase(event.target.value)} /></label>
        </div>}
      <div className="grid gap-3 sm:grid-cols-2">{field('name', '共享主机名称')}{field('servicePort', '共享服务端口')}</div>
      <details className="space-y-3"><summary className="cursor-pointer text-sm text-text-muted">安装目录与访问设置</summary>
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={form.installService} disabled={disabled} onChange={event => form.setInstallService(event.target.checked)} />
          <span>尝试通过 MonPM 注册开机启动服务</span></label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{field('directory', '云端安装目录（可选）', '默认 ~/.local/share/eden-shared-host')}
          {field('publicAddress', '子机访问地址（可选）', '默认使用 SSH IP 和共享端口')}</div>
      </details>
      {form.error ? <p role="alert" className="text-sm text-warning">{form.error}</p> : null}
      <button type="submit" className={sharedPrimaryButtonClass} disabled={disabled || !form.trusted || !form.fingerprint || !(form.authType === 'password' ? form.password : form.privateKey)}>
        {form.pending ? '正在提交…' : '部署并连接云主机'}</button>
    </form>
    {job ? <div role="status" className="space-y-2 border-t border-border pt-4 text-sm">
      <p>{job.message}</p>{job.address ? <p className="break-all font-mono text-xs text-text-muted">{job.address}</p> : null}
      {job.directory ? <p className="break-all font-mono text-xs text-text-muted">安装目录：{job.directory}</p> : null}
      {job.bootService === false ? <p className="text-xs text-warning">未启用系统开机服务，服务器重启后需启动该目录的 MonPM 配置。</p> : null}
      {job.state === 'running' ? <button type="button" className={sharedButtonClass} onClick={() => void form.cancel()}>取消部署</button> : null}
      {job.hostStarted && job.state !== 'succeeded' ? <p className="text-xs text-warning">远端可能仍在运行。请检查云端 MonPM；连接失败时也请检查安全组、端口和访问地址。</p> : null}
      {job.pairingCode && job.address && job.state === 'failed' ? <button type="button" className={sharedButtonClass} disabled={busy}
        onClick={() => void owner.connectHost(job.pairingCode!, job.address)}>重新连接已启动的主机</button> : null}
    </div> : null}
  </section>
}
