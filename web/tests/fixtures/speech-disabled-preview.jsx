import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useTTSSpeech } from '../../src/hooks/useTTSSpeech'

window.speechFixture = { renders: 0, diagnostics: [], rpcCalls: 0, releases: 0, done: false }
const state = window.speechFixture
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
function Fixture({ mode, thinking = false }) {
  state.renders += 1
  if (state.renders > 100) throw new Error('Speech hook entered a render loop')
  // Fresh arrays reproduce callers which derive messages during rendering.
  useTTSSpeech({ mode, isThinking: thinking, segments: [], activeSegments: [], messageRevisions: [] })
  return <div>speech fixture {mode}</div>
}
class Boundary extends React.Component {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  componentDidCatch(error) { state.error = error.message; state.done = true }
  render() { return this.state.error ? <div>fixture failed</div> : this.props.children }
}
const root = createRoot(document.getElementById('root'))
const render = (mode, thinking = false) => flushSync(() => root.render(<Boundary><Fixture mode={mode} thinking={thinking} /></Boundary>))
const disabledStops = () => state.diagnostics.filter(item => item.event === 'playback-stop' && item.details.reason === 'tts-disabled').length
async function run() {
  render('none')
  await wait(150)
  state.initial = { renders: state.renders, disabledStops: disabledStops() }
  if (state.error) return
  for (let i = 0; i < 12; i += 1) { render('none'); await wait(5) }
  state.rerendered = { renders: state.renders, disabledStops: disabledStops() }
  render('all')
  await wait(30)
  render('none')
  await wait(30)
  render('none', true)
  await wait(30)
  render('none', false)
  await wait(150)
  state.final = { renders: state.renders, disabledStops: disabledStops() }
  root.unmount()
  state.done = true
}
void run().catch(error => { state.error = error.message; state.done = true })
