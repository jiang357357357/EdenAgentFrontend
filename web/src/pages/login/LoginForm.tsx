import { useState } from 'react'
import { KeyRound, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react'

export interface LoginFormProps {
  onLogin: (username: string, password: string) => Promise<void>
  isSubmitting?: boolean
  error?: string
  compact?: boolean
}
export function LoginForm({ onLogin, isSubmitting = false, error, compact = false }: LoginFormProps) {
  const [username, setUsername] = useState(''), [password, setPassword] = useState('')
  return <div className="w-full">
    <div className="mb-6">
      {!compact ? <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent"><KeyRound className="h-5 w-5" /></div> : null}
      <h2 id="login-form-heading" className="font-serif text-3xl leading-tight text-text">身份验证</h2>
      <p className="mt-2 text-sm text-text-muted">使用 Core 账号登录</p>
    </div>
    <form className="space-y-4" onSubmit={async event => { event.preventDefault(); await onLogin(username.trim(), password) }}>
      <label className="block">
        <span className="mb-2 block text-sm text-text-muted">用户名</span>
        <div className="flex h-11 items-center gap-3 rounded-xl border border-border bg-input px-3 focus-within:border-accent/60">
          <UserRound className="h-4 w-4 shrink-0 text-text-muted" />
          <input name="username" type="text" required value={username} onChange={event => setUsername(event.target.value)} placeholder="请输入用户名"
            autoComplete="username" disabled={isSubmitting} className="min-w-0 w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted" />
        </div>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm text-text-muted">密码</span>
        <div className="flex h-11 items-center gap-3 rounded-xl border border-border bg-input px-3 focus-within:border-accent/60">
          <LockKeyhole className="h-4 w-4 shrink-0 text-text-muted" />
          <input name="password" type="password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="请输入密码"
            autoComplete="current-password" disabled={isSubmitting} className="min-w-0 w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted" />
        </div>
      </label>
      {error ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger-dim px-3 py-2 text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
        {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{isSubmitting ? '登录中...' : '登录'}
      </button>
    </form>
  </div>
}
