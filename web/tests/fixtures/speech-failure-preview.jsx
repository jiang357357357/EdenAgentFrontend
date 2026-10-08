import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useTTSSpeech } from '../../src/hooks/useTTSSpeech'
window.speechFixture = { calls: [], diagnostics: [], done: false, recover: false }
const state = window.speechFixture, wait = ms => new Promise(resolve => setTimeout(resolve, ms))
let controls
function Fixture({ epoch, thinking }) {
  const segment = { id: 'segment', messageId: 'one', configId: 1, streamEpoch: epoch, text: 'One complete sentence. Another complete sentence.', state: thinking ? 'streaming' : 'done' }
  controls = useTTSSpeech({ sessionId: '00000000-0000-4000-8000-000000000001', mode: 'all', isThinking: thinking,
    activeSegments: [segment], segments: [segment], messageRevisions: [] })
  state.pending = controls.autoPlaybackPending; state.clip = controls.clips.segment
  return <div>fixture</div>
}
const root = createRoot(document.getElementById('root'))
const render = (epoch, thinking) => flushSync(() => root.render(<Fixture epoch={epoch} thinking={thinking} />))
async function run() {
  render(0, true); await wait(1800)
  state.beforeRewrite = state.calls.length
  for (let epoch = 1; epoch <= 15; epoch++) { render(epoch, true); await wait(10) }
  render(15, false); await wait(250)
  state.afterRewrite = state.calls.length; state.pendingAfterFailure = state.pending
  state.recover = true
  controls.toggle('segment', 'One complete sentence. Another complete sentence.', 'one')
  await wait(200)
  state.manualCalls = state.calls.filter(call => call.intent === 'manual').length
  state.pendingAfterManual = state.pending
  root.unmount(); state.done = true
}
void run().catch(error => { state.error = String(error.stack || error); state.done = true })
