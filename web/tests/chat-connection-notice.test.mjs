import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const [{ ChatPage }, { RuntimeNotices }, { ConnectionFeedback }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/chat/ChatPage.tsx'),
  vite.ssrLoadModule('/src/components/chat/RuntimeNotices.tsx'),
  vite.ssrLoadModule('/src/lib/connection-feedback.ts'),
])

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  localStorage: { getItem: key => key === 'agent.runtime_origin' ? 'local' : null },
  location: { origin: 'http://127.0.0.1:1', href: 'http://127.0.0.1:1/' },
  addEventListener() {}, removeEventListener() {},
  innerWidth: 1280, innerHeight: 800,
} })
after(() => {
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
  else delete globalThis.window
})

const callbacks = Object.fromEntries([
  'onDismissConnectionFeedback', 'onRetryConnectionSync', 'onAutoScrollChange', 'onBackgroundChange',
  'onBackgroundImageSelect', 'onAppearanceChange', 'onLoadOlderMessages', 'onSelectSession', 'onDeleteSession',
  'onRenameSession', 'onNewSession', 'onSendMessage', 'onCompact', 'onAbort', 'onFollowupSubagent',
  'onGetSubagentDetails', 'onInterruptSubagent', 'onPermissionReply', 'onPermissionModeChange', 'onPreviewImage',
  'onLogout', 'onOpenAssistantSwitcher', 'onOpenDutyAssistantSwitcher', 'onOpenSessionAssistantSwitcher',
  'onOpenSettings', 'onOpenSelfAwake', 'onOpenAllSessions', 'onOpenMemo', 'onOpenSkills', 'onOpenConnectors', 'onOpenConfiguration',
].map(name => [name, async () => { assert.fail(`SSR must not invoke ${name}`) }]))
const sessions = ['A', 'B'].map(label => ({ id: `session-${label}`, title: `会话${label}`, date: '今天',
  messages: [
    { id: `${label}-user`, role: 'user', content: `PERSISTED_USER_${label}`, timestamp: '10:00' },
    { id: `${label}-assistant`, role: 'assistant', content: `PERSISTED_ASSISTANT_${label}`, timestamp: '10:01' },
  ] }))
const props = { ...callbacks, sessions, isThinking: false, activePendingPermissions: [],
  messagesScrollRef: { current: null }, messagesEndRef: { current: null }, autoScrollEnabled: true,
  backgroundPreference: { opacity: 100, blur: 0, imageBlobId: null }, backgroundReady: true,
  backgroundUploading: false, backgroundSaving: false,
  appearancePreference: { baseTheme: 'night', backgroundMode: 'theme', accentTheme: 'mist', chatFontScale: 100, componentFontScale: 100 },
  appearanceReady: true, appearanceSaving: false, permissionMode: 'restricted' }
const render = (component, values) => renderToStaticMarkup(createElement(component, values))
const noticeProps = { onDismissConnection() {}, onRetrySync() {} }
const headings = html => [...html.matchAll(/<h3\b[^>]*>(.*?)<\/h3>/gs)].map(match => match[1].replace(/<[^>]+>/g, ''))

test('first entry exposes the conversation toolbar before a session or preferences have loaded', () => {
  for (const ready of [false, true]) {
    const html = render(ChatPage, { ...props, sessions: [], activeSessionId: '',
      backgroundReady: ready, appearanceReady: ready,
      connectionFeedback: { phase: 'idle', revision: 0, hasConnected: false } })
    const toolbar = html.match(/<header\b[^>]*aria-label="会话工具栏"[^>]*>(.*?)<\/header>/s)?.[1]
    assert.ok(toolbar, 'The empty conversation must retain its toolbar')
    assert.match(toolbar, /新会话/)
    for (const label of ['调整角色位置', '调整回复长度', '调整界面外观', '关闭新消息自动滚动']) {
      assert.ok(toolbar.includes(`aria-label="${label}"`), `${label} remains accessible`)
    }
    assert.equal(/<button\b[^>]*disabled=""[^>]*aria-label="调整界面外观"/.test(toolbar), !ready)
    assert.doesNotMatch(toolbar, /role="tab"/)
    assert.match(html, /想聊点什么？/)
    assert.match(html, /grid-rows-\[auto_auto_minmax\(0,1fr\)_auto\]/)
  }
})

test('wallpaper preferences remain intact while empty and restored chats use a theme-colored reading surface', () => {
  for (const baseTheme of ['cream', 'night']) {
    for (const session of [undefined, sessions[0]]) {
      const html = render(ChatPage, { ...props, activeSessionId: session?.id ?? '', activeSession: session,
        backgroundPreference: { opacity: 73, blur: 4, imageBlobId: 'fixture-wallpaper' },
        appearancePreference: { ...props.appearancePreference, baseTheme, backgroundMode: 'wallpaper' },
        connectionFeedback: { phase: 'idle', revision: 0, hasConnected: true } })
      const main = html.match(/<main\b[^>]*>/)?.[0]
      assert.match(main, /background-color:var\(--interface-panel-background\)/)
      assert.match(html, /--interface-panel-background:color-mix\(in oklab, var\(--color-bg\) 85%, transparent\)/)
      assert.match(html, /--interface-background-opacity:0\.73/)
      assert.match(html, /--interface-background-blur:4px/)
      const toolbar = html.match(/<header\b[^>]*aria-label="会话工具栏"[^>]*>(.*?)<\/header>/s)?.[1]
      assert.ok(toolbar)
      if (session) {
        assert.match(toolbar, /role="tab" aria-selected="true"/)
        assert.doesNotMatch(toolbar, /新会话/)
        for (const message of session.messages) assert.ok(html.includes(message.content))
      }
    }
  }
})

test('chat and character panels share every opacity value including completely transparent and opaque', () => {
  for (const panelOpacity of [0, 37, 85, 100]) {
    const html = render(ChatPage, { ...props, sessions: [], activeSessionId: '',
      appearancePreference: { ...props.appearancePreference, panelOpacity },
      connectionFeedback: { phase: 'idle', revision: 0, hasConnected: false } })
    assert.ok(html.includes(`--interface-panel-background:color-mix(in oklab, var(--color-bg) ${panelOpacity}%, transparent)`))
    const main = html.match(/<main\b[^>]*>/)?.[0]
    const character = html.match(/<aside\b[^>]*w-\[34vw\][^>]*>/)?.[0]
    for (const panel of [main, character]) {
      assert.match(panel, /background-color:var\(--interface-panel-background\)/)
      assert.doesNotMatch(panel, /(?:style="|;)opacity:/)
    }
  }
})

test('the real ChatPage retains each selected session’s existing messages during reconnect and snapshot restoration', () => {
  for (const phase of ['reconnecting', 'restoring']) {
    for (const [index, session] of sessions.entries()) {
      const html = render(ChatPage, { ...props, activeSessionId: session.id, activeSession: session,
        connectionFeedback: { phase, revision: 2, hasConnected: true, reason: '测试连接中断' } })
      for (const message of session.messages) assert.ok(html.includes(message.content), `${phase}: ${message.id} stays visible`)
      for (const message of sessions[1 - index].messages) assert.ok(!html.includes(message.content), 'The notice must not substitute another session’s messages')
      assert.ok(headings(html).includes(phase === 'reconnecting' ? '此会话连接中断，正在重连' : '连接已建立，正在同步'))
      assert.ok(!headings(html).includes('连接已恢复'))
      assert.doesNotMatch(html, /想聊点什么？/)
    }
  }
})

test('snapshot synchronization failure exposes an explicit retry and its diagnostic without claiming complete restoration', () => {
  let state
  const feedback = new ConnectionFeedback(value => { state = value })
  feedback.opened()
  feedback.disconnected('temporary disconnect')
  const pending = feedback.opened()
  feedback.synchronized(pending.revision, 'fixture snapshot read failed')
  const html = render(RuntimeNotices, { ...noticeProps, connection: state })
  assert.equal(state.phase, 'sync-error')
  assert.ok(headings(html).includes('连接已恢复，部分内容同步失败'))
  assert.ok(!headings(html).includes('连接已恢复'))
  assert.match(html, /<button\b[^>]*type="button"[^>]*>重新同步<\/button>/)
  assert.match(html, /fixture snapshot read failed/)
  assert.match(html, /已有消息仍可查看/)
})

test('model retry remains separate from connection recovery and can coexist with snapshot restoration', () => {
  const retry = { attempt: 2, maxAttempts: 3 }
  const html = render(RuntimeNotices, { ...noticeProps, connection: { phase: 'idle', revision: 1, hasConnected: true }, modelRetry: retry })
  assert.deepEqual(headings(html), ['模型响应中断，正在重试'])
  assert.match(html, /2.*3.*次重试/s)
  assert.match(html, /role="status"/)
  assert.doesNotMatch(html, /<section[^>]*aria-busy/)
  assert.doesNotMatch(html, /连接已恢复|连接中断，正在重连/)
  const restoring = render(RuntimeNotices, { ...noticeProps, connection: { phase: 'restoring', revision: 2, hasConnected: true }, modelRetry: retry })
  assert.deepEqual(headings(restoring), ['连接已建立，正在同步', '模型响应中断，正在重试'])
})

test('connection-open alone and stale synchronization completions cannot produce a restored notice', () => {
  let state
  const feedback = new ConnectionFeedback(value => { state = value })
  feedback.opened()
  feedback.disconnected('first failure')
  const first = feedback.opened()
  assert.equal(state.phase, 'restoring')
  feedback.disconnected('second failure')
  feedback.synchronized(first.revision)
  assert.equal(state.phase, 'reconnecting')
  const second = feedback.opened()
  feedback.reset(false)
  feedback.synchronized(second.revision)
  assert.equal(state.phase, 'idle')
  assert.equal(render(RuntimeNotices, { ...noticeProps, connection: state }), '')
})
