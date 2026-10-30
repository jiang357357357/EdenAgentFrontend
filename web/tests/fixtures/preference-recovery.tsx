import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useAutoScrollPreference } from '../../src/lib/use-auto-scroll-preference'
import { useBackgroundPreference } from '../../src/lib/use-background-preference'
import { useAppearancePreference } from '../../src/lib/use-appearance-preference'
import { fixture } from './preference-recovery-state'
import { RuntimeNotices } from '../../src/components/chat/RuntimeNotices'
import '../../src/index.css'

localStorage.setItem('agent.runtime_origin', 'local')
Object.assign(window, { preferenceRecoveryFixture: fixture })
function Preview() {
  const [account, setAccount] = useState(1)
  const [, redraw] = useState(0)
  const scroll = useAutoScrollPreference('local', true, account)
  const background = useBackgroundPreference('local', true, account)
  const appearance = useAppearancePreference('local', true, account)
  const error = [...new Set([scroll.error, background.error, appearance.error].filter(Boolean))].join('；') || undefined
  return <main className="space-y-5 p-8 text-text"><h1>界面设置连接恢复</h1>
    <RuntimeNotices connection={{ phase: 'idle', revision: 0, hasConnected: true }} runtimeError={error} onDismissConnection={() => {}} onRetrySync={() => {}} />
    <output aria-label="设置就绪">{scroll.ready && background.ready && appearance.ready ? '已就绪' : '读取中'}</output>
    <p aria-label="读取结果">{String(scroll.enabled)} / {background.value.opacity} / {appearance.value.baseTheme}</p>
    <button onClick={() => { fixture.account = 2; setAccount(2); window.dispatchEvent(new Event('edenagent:account-changed')) }}>切换账号</button>
    <button onClick={() => { fixture.account = 2; window.dispatchEvent(new Event('edenagent:account-changed')) }}>刷新账号连接</button>
    <button onClick={() => fixture.release.splice(0).forEach(release => release())}>结束旧读取</button>
    <button onClick={() => appearance.change({ ...appearance.value, chatFontScale: 110 })}>保存外观</button>
    <button onClick={() => redraw(value => value + 1)}>重绘界面</button>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
