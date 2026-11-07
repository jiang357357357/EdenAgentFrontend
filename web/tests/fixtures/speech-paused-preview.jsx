import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useTTSSpeech } from '../../src/hooks/useTTSSpeech'

window.speechFixture = { calls: [], played: [], diagnostics: [], done: false }
const state = window.speechFixture, wait = ms => new Promise(resolve => setTimeout(resolve, ms))
class ControlledAudio extends EventTarget {
  paused = true; currentTime = 0; duration = 1; value = ''; playback = false
  constructor(source) { super(); this.playback = Boolean(source); if (source) this.src = source }
  get src() { return this.value }
  set src(value) {
    this.value = value
    const notify = () => this.dispatchEvent(new Event('loadedmetadata'))
    if (this.playback && state.playbackMetadataDelayMs) setTimeout(notify, state.playbackMetadataDelayMs)
    else queueMicrotask(notify)
  }
  load() {}
  removeAttribute() { this.value = '' }
  async play() { this.paused = false; state.played.push(this.src); this.dispatchEvent(new Event('play')) }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
}
window.Audio = ControlledAudio
let controls
function Fixture({ thinking, messages, active }) {
  controls = useTTSSpeech({ sessionId: '00000000-0000-4000-8000-000000000001', mode: 'all', isThinking: thinking,
    segments: messages, activeSegments: active, messageRevisions: [] })
  state.active = controls.activeSegmentId; state.paused = controls.paused
  return <div>isolated speech playback</div>
}
let root = createRoot(document.getElementById('root'))
const render = (thinking, messages, active) => flushSync(() => root.render(<Fixture thinking={thinking} messages={messages} active={active} />))
const segment = (id, text, streaming = true) => ({ id: `${id}-segment`, messageId: id, configId: 1, text, state: streaming ? 'streaming' : 'done' })
const oldText = '上一条消息的第一句。还有未结束的内容'
const newText = '下一条消息的第一句。正在继续生成'
async function run() {
  const old = segment('old', oldText)
  render(true, [old], [old]); await wait(80)
  state.initial = { active: state.active, calls: state.calls.length }
  controls.toggle(old.id, old.text, old.messageId); await wait(20)
  state.sameTurnPaused = state.paused
  render(true, [segment('old', oldText + '。新的尾巴')], [segment('old', oldText + '。新的尾巴')]); await wait(40)
  state.stillPaused = state.paused
  controls.toggle(old.id, old.text, old.messageId); await wait(20)
  state.sameTurnResumed = !state.paused
  controls.toggle(old.id, old.text, old.messageId); await wait(20)
  const oldDone = segment('old', oldText + '。新的尾巴', false)
  render(false, [oldDone], [oldDone]); await wait(30)
  const next = segment('next', newText)
  render(true, [oldDone, next], [next]); await wait(100)
  state.beforeCompletion = { active: state.active, paused: state.paused,
    calls: state.calls.filter(call => call.messageId === 'next').map(call => call.text),
    played: state.played.filter(source => source.startsWith('fixture-audio:next:')) }
  const extended = segment('next', '下一条消息的第一句。正在继续生成第二句。还有结尾')
  render(true, [oldDone, extended], [extended]); await wait(80)
  state.afterAppend = state.calls.filter(call => call.messageId === 'next').map(call => call.text)
  const diagnostics = state.diagnostics.filter(item => item.event === 'playback-group-reserved' && item.details.messageId === 'next')
  state.nextReservations = diagnostics.length
  root.unmount(); await wait(20)
  root = createRoot(document.getElementById('root'))
  state.playbackMetadataDelayMs = 100
  const buffered = segment('buffered', '仍在加载音频。后面还有内容')
  render(true, [buffered], [buffered]); await wait(30)
  state.bufferedInitially = { active: state.active, paused: state.paused }
  const bufferedDone = { ...buffered, state: 'done' }
  render(false, [bufferedDone], [bufferedDone]); await wait(10)
  const pending = segment('pending', '又一条新消息。接着生成')
  render(true, [bufferedDone, pending], [pending]); await wait(140)
  state.bufferedAcrossRun = state.played.filter(source => source.startsWith('fixture-audio:buffered:'))
  state.bufferedRunInterrupts = state.diagnostics.filter(item => item.event === 'playback-stop' && item.details.reason === 'new-run-after-paused-playback').length
  root.unmount(); state.done = true
}
void run().catch(error => { state.error = String(error.stack || error); state.done = true })
