import { Mic, MicOff, Minus, PhoneOff, X } from 'lucide-react'
import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { CoreAssistant } from '../../../lib/auth'
import type { RealtimeSTTStatus } from '../../../lib/realtime-stt'
import type { VoiceCallPhase } from './hooks/useRealtimeVoiceInput'
import type { VoiceCallCaption } from './voice-call-captions'
import { VoiceCallPortrait } from './VoiceCallPortrait'
import './voice-conversation.css'

interface VoiceConversationPanelProps {
  assistantName: string
  assistant?: CoreAssistant | null | undefined
  callPhase: VoiceCallPhase
  elapsedLabel: string
  error: string
  outputActive: boolean
  replyPlaying: boolean
  captions: { history: readonly VoiceCallCaption[]; current: VoiceCallCaption | undefined }
  level: number
  onHangUp(): void
  onMinimize(): void
  onMute(): void
  onUnmute(): void
  muted: boolean
  status: RealtimeSTTStatus
  waiting: boolean
}

const waveShape = Array.from({ length: 66 }, (_, index) => {
  const envelope = Math.sin(index / 65 * Math.PI) ** 1.7
  return envelope * (.13 + .77 * Math.sin(index * .175) ** 2) * (.8 + .2 * Math.cos(index * .82) ** 2)
})

function CallWaveform({ level, speaking }: { level: number; speaking: boolean }) {
  const amplitude = Math.max(0, Math.min(1, speaking ? .76 : level))
  return <div className="voice-call-waveform" aria-hidden="true" data-speaking={speaking}>
    <div className="voice-call-wave-track" style={{ '--voice-call-level': amplitude } as CSSProperties}>
      {waveShape.map((height, index) => <i key={index} style={{ '--bar-height': height, '--bar-index': index } as CSSProperties} />)}
    </div>
  </div>
}

export function VoiceConversationPanel({ assistantName, assistant, callPhase, elapsedLabel, error, outputActive, replyPlaying,
  captions, level, onHangUp, onMinimize, onMute, onUnmute, muted, status, waiting }: VoiceConversationPanelProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const nameId = useId()
  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  const dialing = callPhase === 'dialing', opening = callPhase === 'opening'
  const speaking = opening || replyPlaying
  const micLive = !muted && status === 'recording'
  const state = error ? 'failed' : dialing ? 'dialing' : 'connected'
  const statusText = error ? (callPhase === 'unanswered' ? '未接通' : '通话中断') : dialing ? '等待接听' : '已接通'
  const activity = speaking ? '正在说话' : muted ? '麦克风已静音' : status === 'transcribing' ? '正在转写'
    : waiting || outputActive ? '等待回复' : micLive ? '正在聆听' : '连接语音识别'

  return (
    <dialog ref={dialog} className="voice-call-dialog" aria-labelledby={nameId} data-state={state}
      onCancel={event => { event.preventDefault(); if (error) onHangUp(); else onMinimize() }}>
      <header className="voice-call-header">
        <div className="voice-call-status">
          <span role="status"><i aria-hidden="true" />{statusText}</span>
          {state === 'connected' && <time className="voice-call-time">{elapsedLabel}</time>}
        </div>
        {!error && <button type="button" className="voice-call-minimize" title="收起通话" aria-label="收起通话" onClick={onMinimize}>
          <Minus size={17} /> 收起
        </button>}
      </header>
      <div className="voice-call-body">
        <section className="voice-call-participant">
          <div className="voice-call-portrait" aria-hidden="true" data-speaking={speaking}
            style={{ '--voice-call-level': micLive ? Math.max(0, Math.min(level, 1)) : 0 } as CSSProperties}>
            <VoiceCallPortrait assistant={assistant} name={assistantName} />
          </div>
          <h2 id={nameId}>{assistantName}</h2>
        </section>
        <section className="voice-call-dialogue" aria-label="通话字幕">
          <div className="voice-call-stage">
            <div className="voice-call-lines">
              {error ? <p className="voice-call-error" role="alert">{error}</p> : (
                <>
                  {captions.history.length > 0 && <ol className="voice-call-history" aria-label="最近字幕">
                    {captions.history.map(line => <li key={line.id}><b>{line.speaker}</b><span>{line.text}</span></li>)}
                  </ol>}
                  {captions.current && <div className="voice-call-caption" key={captions.current.id}>
                    <span className="voice-call-speaker">{captions.current.speaker}</span>
                    <p>{captions.current.text}</p>
                  </div>}
                  {state === 'connected' && <p className="voice-call-activity" role="status">{activity}</p>}
                </>
              )}
            </div>
          </div>
          <CallWaveform level={micLive ? level : 0} speaking={speaking && !error} />
        </section>
      </div>
      <footer className="voice-call-actions">
        {!error && <button type="button" onClick={muted ? onUnmute : onMute} aria-pressed={muted} disabled={dialing || opening || status === 'transcribing'}>
          {muted ? <MicOff size={19} /> : <Mic size={19} />}<span>{muted ? '取消静音' : '静音'}</span>
        </button>}
        <button type="button" className="voice-call-hangup" onClick={onHangUp}>
          {error ? <X size={19} /> : <PhoneOff size={19} />}<span>{error ? '关闭' : '挂断'}</span>
        </button>
      </footer>
    </dialog>
  )
}
