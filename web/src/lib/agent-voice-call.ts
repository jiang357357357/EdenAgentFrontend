import { speechChunksForTTS, speechStreamKey, type VoiceCallAnswer, type VoiceCallTurn } from '@eden/api'
import { claimDesktopSpeechPlayback, listenDesktopSpeechPlaybackControl, releaseDesktopSpeechPlayback, reportSpeechDiagnostic } from './desktop-window'
import { ObjectUrlScope } from './object-url-scope'
import { requestSpeechSynthesis, resolveVoiceBlobUrl, rpcRequestForOrigin } from './rpc-transport'
import { getRuntimeOriginRevision, getStoredRuntimeOrigin } from './runtime-origin'

export type DesktopVoiceTurn = VoiceCallTurn & { sessionId: string }
export type DesktopVoiceDestination = { sessionId: string; configId: number }
export type DesktopVoiceCallState =
  | { sessionId: string; phase: 'dialing' }
  | { sessionId: string; phase: 'opening' | 'connected'; greetingMessageId: string }
export type CallAudioSettings = { audioOutputDeviceId: string; speechRate: number; speechVolume: number }
type Greeting = Extract<VoiceCallAnswer, { state: 'answered' }>

export function createDesktopVoiceCall(sessionId: string) {
  const origin = getStoredRuntimeOrigin() ?? 'mon', revision = getRuntimeOriginRevision()
  const key = { sessionId, callId: crypto.randomUUID() }
  const controller = new AbortController()
  const check = () => {
    controller.signal.throwIfAborted()
    if (getRuntimeOriginRevision() !== revision) throw new Error('当前世界已切换，请重新拨打')
  }
  return {
    ...key,
    open: () => rpcRequestForOrigin(origin, 'voice.call.open', { ...key, awaitAnswer: true }),
    async waitForAnswer(): Promise<Greeting> {
      const deadline = performance.now() + 50_000
      while (performance.now() < deadline) {
        check()
        const answer = await rpcRequestForOrigin(origin, 'voice.call.answer', key)
        check()
        if (answer.state === 'answered') return answer
        if (answer.state === 'failed') throw new Error(answer.error)
        await new Promise(resolve => window.setTimeout(resolve, 400))
      }
      throw new Error('智能体暂时未接听')
    },
    playGreeting: (greeting: Greeting, settings?: CallAudioSettings) =>
      playGreeting(sessionId, greeting, AbortSignal.any([controller.signal, AbortSignal.timeout(65_000)]), settings),
    end: async () => {
      controller.abort()
      if (getRuntimeOriginRevision() === revision) await rpcRequestForOrigin(origin, 'voice.call.close', key)
    },
    utterance: (): DesktopVoiceTurn => ({ ...key, requestId: crypto.randomUUID() }),
  }
}

async function playGreeting(sessionId: string, greeting: Greeting, callSignal: AbortSignal, settings?: CallAudioSettings) {
  const interruption = new AbortController()
  const signal = AbortSignal.any([callSignal, interruption.signal])
  const scope = new ObjectUrlScope()
  const disposeUrls = () => scope.dispose()
  const diagnostic = { sessionId, messageId: greeting.messageId }
  let leaseId: string | undefined
  let completed = false
  signal.addEventListener('abort', disposeUrls, { once: true })
  const unlisten = await listenDesktopSpeechPlaybackControl(control => {
    if (control.leaseId === leaseId) interruption.abort(new Error('通话开场白的播放已中断'))
  })
  try {
    signal.throwIfAborted()
    const claim = await claimDesktopSpeechPlayback('main-chat', `voice-call-greeting:${greeting.messageId}`, 'manual')
    leaseId = claim.leaseId
    signal.throwIfAborted()
    if (!claim.granted || !leaseId) throw new Error('暂时无法播放通话开场白')
    void reportSpeechDiagnostic('voice-call-greeting-playback-start', diagnostic)
    for (const [sequence, text] of speechChunksForTTS(greeting.text, 'text_only').entries()) {
      const result = await requestSpeechSynthesis({ sessionId, messageId: greeting.messageId,
        segmentGroupId: speechStreamKey(greeting.messageId, 0), groupIndex: 0, sequence, text,
        configId: greeting.configId, mode: 'text_only', intent: 'auto' }, signal)
      if (!result.audio_blob_id) throw new Error('未收到开场语音')
      const source = await resolveVoiceBlobUrl(result.audio_blob_id, scope)
      await playClip(source, signal, settings)
    }
    completed = true
  } finally {
    unlisten?.()
    signal.removeEventListener('abort', disposeUrls)
    disposeUrls()
    if (leaseId) {
      await releaseDesktopSpeechPlayback(leaseId, completed ? 'completed' : 'interrupted')
      void reportSpeechDiagnostic('voice-call-greeting-playback-end', { ...diagnostic, completed })
    }
  }
}

async function playClip(source: string, signal: AbortSignal, settings?: CallAudioSettings) {
  signal.throwIfAborted()
  const audio = new Audio(source)
  if (settings) {
    audio.volume = Math.max(0, Math.min(1, settings.speechVolume / 100))
    audio.playbackRate = Math.max(0.5, Math.min(2, settings.speechRate))
    if (settings.audioOutputDeviceId !== 'default' && 'setSinkId' in audio) {
      await (audio as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(settings.audioOutputDeviceId).catch(() => {})
    }
  }
  signal.throwIfAborted()
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => finish(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      const finish = (error?: unknown) => {
        signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve()
      }
      audio.onended = () => finish()
      audio.onerror = () => finish(new Error('开场语音播放失败'))
      void audio.play().catch(finish)
    })
  } finally {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
}
