import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyReplyText } from '../src/lib/reply-copy.ts'

test('reply copy uses the desktop bridge even when browser clipboard permission is denied', async () => {
  const calls = []
  const windowMock = { edenAgentDesktop: { async invoke(command, args) { calls.push({ command, args }); return true } } }
  const navigatorMock = { clipboard: { writeText() { assert.fail('Desktop must not use browser clipboard permission') } } }
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: windowMock })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigatorMock })
    const text = '**正文**\n  缩进 😊'
    await copyReplyText(text)
    assert.deepEqual(calls, [{ command: 'write_clipboard_text', args: { text } }])
    windowMock.edenAgentDesktop.invoke = async () => { throw new Error('native clipboard failure') }
    await assert.rejects(copyReplyText(text), /native clipboard failure/)
    windowMock.edenAgentDesktop.invoke = async () => false
    await assert.rejects(copyReplyText(text), /未确认写入/)
    delete windowMock.edenAgentDesktop
    const writes = []
    navigatorMock.clipboard.writeText = async value => { writes.push(value) }
    await copyReplyText(text)
    assert.deepEqual(writes, [text])
    navigatorMock.clipboard.writeText = async () => { throw new DOMException('Write permission denied', 'NotAllowedError') }
    await assert.rejects(copyReplyText(text), /浏览器拒绝了复制/)
    delete navigatorMock.clipboard
    await assert.rejects(copyReplyText(text), /无法访问剪贴板/)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else delete globalThis.window
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
  }
})

test('an old desktop host gives explicit tray restart guidance without retrying or claiming success', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let invocations = 0
  const bridge = { async invoke(command, args) {
    invocations++
    assert.equal(command, 'write_clipboard_text')
    assert.deepEqual(args, { text: '回答正文' })
    throw new Error("Error invoking remote method 'eden-agent:invoke': Error: 未知桌面命令: write_clipboard_text")
  } }
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { edenAgentDesktop: bridge } })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: {
      writeText() { assert.fail('An unavailable desktop command must not fall back to the denied browser API') },
    } } })
    await assert.rejects(copyReplyText('回答正文'), error => {
      assert.match(error.message, /从系统托盘退出 Eden Agent 后重新启动/)
      assert.match(error.message, /仅刷新页面或关闭窗口不会生效/)
      assert.doesNotMatch(error.message, /eden-agent:invoke|write_clipboard_text/)
      return true
    })
    assert.equal(invocations, 1)
    bridge.invoke = async () => { throw new Error('未知桌面命令: write_clipboard_text_extra') }
    await assert.rejects(copyReplyText('回答正文'), /write_clipboard_text_extra/)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else delete globalThis.window
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
  }
})
