import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { StartupEntrance } from '../../src/pages/startup/StartupEntrance'
import { startupScene } from '../../src/pages/startup/startup-assets'
import type { RuntimeOrigin } from '../../src/lib/runtime-origin'
import App from '../../src/App'
import { LoginPage } from '../../src/pages/login/LoginPage'

const query = new URLSearchParams(location.search)
function Harness() {
  const [origin, setOrigin] = useState<RuntimeOrigin | null>(query.has('cached') ? 'mon' : null)
  const [authStatus, setStatus] = useState<'authenticated' | 'unauthenticated'>(query.has('cached') ? 'authenticated' : 'unauthenticated')
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>(), [done, setDone] = useState(false)
  const [scene] = useState(() => {
    const original = startupScene(Number(query.get('hour') ?? 12))
    const value = query.has('pose') ? { ...original, room: { ...original.room, idle_animation: `Idle_0${Number(query.get('pose'))}` } } : original
    return query.has('missing') ? { ...value, room: { ...value.room, skeleton_url: new URL('missing.skel', location.href).href } } : value
  })
  if (done) return <main data-startup-complete={origin}>已进入{origin === 'mon' ? '伊甸园' : '尘世'}</main>
  return <StartupEntrance scene={scene} origin={origin} authStatus={authStatus} isSubmitting={busy} error={error} userName="临时测试账号"
    onChooseOrigin={value => { setOrigin(value); setStatus(value === 'local' ? 'authenticated' : 'unauthenticated') }}
    onContinue={() => setDone(true)} onLogin={async (username, password) => {
      setBusy(true); setError(undefined); setOrigin('mon')
      try {
        const response = await fetch('/fixture/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
        if (!response.ok) { setError('用户名或密码错误'); return }
        setStatus('authenticated')
      } finally { setBusy(false) }
    }} />
}
createRoot(document.getElementById('root')!).render(<StrictMode>{query.has('plainLogin') ? <LoginPage onLogin={async () => {}} /> : query.has('fullApp') ? <App /> : <Harness />}</StrictMode>)
