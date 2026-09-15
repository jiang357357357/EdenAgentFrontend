import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { TextSegment } = await vite.ssrLoadModule('/src/components/chat/message/TextSegment.tsx')
after(() => vite.close())
const props = { segment: { type: 'text', id: 's', content: '这是测试语音', state: 'completed' }, isUser: false,
  messageId: 'm', ttsMode: 'all', speechClips: { s: { status: 'synthesizing' } }, speechPaused: false }

test('synthesis without audio exposes cancellation instead of an inert spinner', () => {
  const html = renderToStaticMarkup(createElement(TextSegment, props))
  assert.match(html, /aria-label="取消本条消息的语音合成"/)
  assert.doesNotMatch(html, /aria-label="播放这段语音"/)
})

test('streaming playback keeps pause and resume available while synthesis continues', () => {
  const active = { ...props, segment: { ...props.segment, state: 'streaming' }, activeSpeechSegmentId: 's' }
  const playing = renderToStaticMarkup(createElement(TextSegment, active))
  assert.match(playing, /aria-label="暂停这段语音"/)
  assert.match(playing, /aria-label="取消本条消息的语音合成"/)
  const paused = renderToStaticMarkup(createElement(TextSegment, { ...active, speechPaused: true }))
  assert.match(paused, /aria-label="播放这段语音"/)
  assert.match(paused, /aria-label="取消本条消息的语音合成"/)
})
