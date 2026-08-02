import { useEffect, useRef, useState } from "react"
import { resolveCoreAssetUrl } from "../lib/auth"
import {
  claimDesktopSpeechPlayback,
  listenDesktopSpeechPlaybackControl,
  releaseDesktopSpeechPlayback,
  updateDesktopActivityFacts,
  type DesktopSpeechIntent,
  type PetTTSMode,
} from "../lib/desktop-window"
import { synthesizeSpeechSegment } from "../lib/mon_agent_api"
import { SpeechOutputGate } from "../lib/speech-output-gate"
import {
  consumeSpeechStream,
  speechStreamKey,
  speechChunksForTTS,
  textForTTS,
  type SpeechStreamCursor,
} from "../lib/tts-text"

export interface SpeechClip {
  status: "synthesizing" | "ready" | "error"
  source?: string
  sources?: string[]
  error?: string
}

interface SpeechSegment {
  id: string
  messageId: string
  text: string
  state?: "streaming" | "done"
}

interface StreamingSpeechState {
  segmentId: string
  streamKey: string
  cursor?: SpeechStreamCursor
  nextChunkIndex: number
  pending: number
  sources: Map<number, string>
  complete: boolean
  error?: string
}

interface UseTTSSpeechOptions {
  configId?: number | null
  sessionId?: string
  mode: PetTTSMode
  isThinking: boolean
  segments: SpeechSegment[]
}

export function useTTSSpeech({ configId, sessionId, mode, isThinking, segments }: UseTTSSpeechOptions) {
  const [clips, setClips] = useState<Record<string, SpeechClip>>({})
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [autoPlaybackPending, setAutoPlaybackPending] = useState(isThinking)
  const [paused, setPaused] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioSegmentIdRef = useRef<string | null>(null)
  const finishAudioRef = useRef<(() => void) | null>(null)
  const generationRef = useRef(0)
  const playbackGenerationRef = useRef(0)
  const synthesisQueueRef = useRef<Promise<void>>(Promise.resolve())
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const runActiveRef = useRef(isThinking)
  const streamStatesRef = useRef<Map<string, StreamingSpeechState>>(new Map())
  const speechLeaseRef = useRef<string | null>(null)
  const synthesisContextRef = useRef(`${sessionId ?? ""}:${mode}`)
  const outputGateRef = useRef<SpeechOutputGate | null>(null)
  if (!outputGateRef.current) {
    outputGateRef.current = new SpeechOutputGate(isThinking, setAutoPlaybackPending)
  }

  const stop = (cancelSynthesis = false, clearClips = false) => {
    outputGateRef.current?.reset(false)
    playbackGenerationRef.current += 1
    if (cancelSynthesis) {
      generationRef.current += 1
      streamStatesRef.current.clear()
    }
    audioRef.current?.pause()
    audioRef.current = null
    audioSegmentIdRef.current = null
    finishAudioRef.current?.()
    finishAudioRef.current = null
    const leaseId = speechLeaseRef.current
    speechLeaseRef.current = null
    void releaseDesktopSpeechPlayback(leaseId)
    synthesisQueueRef.current = Promise.resolve()
    queueRef.current = Promise.resolve()
    setActiveSegmentId(null)
    setPaused(false)
    if (clearClips) setClips({})
  }

  const playSource = (segmentId: string, source: string, generation: number) => new Promise<void>((resolve, reject) => {
    if (generation !== generationRef.current) {
      resolve()
      return
    }
    const audio = new Audio(source)
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      if (finishAudioRef.current === finish) finishAudioRef.current = null
      if (audioRef.current === audio) audioRef.current = null
      if (audioSegmentIdRef.current === segmentId) audioSegmentIdRef.current = null
      setPaused(false)
      if (error) reject(error)
      else resolve()
    }
    audioRef.current = audio
    audioSegmentIdRef.current = segmentId
    finishAudioRef.current = () => finish()
    setActiveSegmentId(segmentId)
    setPaused(false)
    audio.addEventListener("ended", () => finish(), { once: true })
    audio.addEventListener("error", () => finish(new Error(`语音段 ${segmentId} 播放失败`)), { once: true })
    void audio.play().catch((error) => finish(error))
  })

  const playSources = async (
    segmentId: string,
    sources: string[],
    generation: number,
    playbackGeneration: number,
    intent: DesktopSpeechIntent,
    speechKey = segmentId,
  ) => {
    if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) return
    const claim = await claimDesktopSpeechPlayback("main-chat", speechKey, intent)
    if (!claim.granted || !claim.leaseId) return
    if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) {
      void releaseDesktopSpeechPlayback(claim.leaseId)
      return
    }
    speechLeaseRef.current = claim.leaseId
    setActiveSegmentId(segmentId)
    setPaused(false)
    try {
      for (const source of sources) {
        if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) return
        await playSource(segmentId, source, generation)
      }
    } finally {
      if (speechLeaseRef.current === claim.leaseId) speechLeaseRef.current = null
      void releaseDesktopSpeechPlayback(claim.leaseId)
      setActiveSegmentId((current) => current === segmentId ? null : current)
      setPaused(false)
    }
  }

  const synthesize = (segmentId: string, messageId: string, rawText: string, autoPlay: boolean) => {
    const chunks = speechChunksForTTS(rawText, mode)
    if (!chunks.length || !sessionId || !messageId || typeof configId !== "number" || mode === "none") return

    const generation = generationRef.current
    const playbackGeneration = playbackGenerationRef.current
    setClips((current) => ({ ...current, [segmentId]: { status: "synthesizing" } }))
    const synthesis = (async () => {
      const sources: string[] = []
      for (const [index, text] of chunks.entries()) {
        const requestSegmentId = chunks.length === 1 ? segmentId : `${segmentId}:tts:${index}`
        const result = await synthesizeSpeechSegment({
          sessionId,
          messageId,
          segmentId: requestSegmentId,
          text,
          configId,
          mode,
        })
        if (!result.success) throw new Error(result.error_message || `语音段 ${index + 1}/${chunks.length} 合成失败`)
        const source = result.audio_data
          ? `data:audio/wav;base64,${result.audio_data}`
          : resolveCoreAssetUrl(result.audio_url)
        if (!source) throw new Error(`语音段 ${index + 1}/${chunks.length} 未返回音频`)
        sources.push(source)
      }

      if (!sources.length) throw new Error(`语音段 ${segmentId} 未返回音频`)
      return sources
    })()
      .then((sources) => {
        if (generation === generationRef.current) {
          setClips((current) => ({
            ...current,
            [segmentId]: { status: "ready", source: sources[0], sources },
          }))
        }
        return sources
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        if (generation === generationRef.current) {
          setClips((current) => ({ ...current, [segmentId]: { status: "error", error: message } }))
        }
        console.warn("[Chat][TTS] 合成失败", error)
        return null
      })

    if (!autoPlay) return synthesis
    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        const sources = await synthesis
        if (!sources || generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) return
        await playSources(segmentId, sources, generation, playbackGeneration, "auto")
      })
      .catch((error) => console.warn("[Chat][TTS] 播放失败", error))
    return synthesis
  }

  const updateStreamingClip = (state: StreamingSpeechState) => {
    const segmentId = state.segmentId
    const sources = [...state.sources.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, source]) => source)
    const settled = state.complete && state.pending === 0
    setClips((current) => ({
      ...current,
      [segmentId]: state.error && settled
        ? { status: "error", source: sources[0], sources, error: state.error }
        : settled
          ? { status: "ready", source: sources[0], sources }
          : { status: "synthesizing", source: sources[0], sources },
    }))
  }

  const enqueueStreamingChunk = (
    messageId: string,
    text: string,
    chunkIndex: number,
    state: StreamingSpeechState,
  ) => {
    if (!sessionId || !messageId || typeof configId !== "number" || mode === "none") return
    const generation = generationRef.current
    const playbackGeneration = playbackGenerationRef.current
    state.pending += 1
    updateStreamingClip(state)

    const request = synthesisQueueRef.current
      .catch(() => undefined)
      .then(() => synthesizeSpeechSegment({
        sessionId,
        messageId,
        segmentId: `${state.streamKey}:tts:${chunkIndex}`,
        text,
        configId,
        mode,
      }))
    synthesisQueueRef.current = request.then(() => undefined, () => undefined)
    const synthesis = request
      .then((result) => {
        if (!result.success) throw new Error(result.error_message || `语音句子 ${chunkIndex + 1} 合成失败`)
        const source = result.audio_data
          ? `data:audio/wav;base64,${result.audio_data}`
          : resolveCoreAssetUrl(result.audio_url)
        if (!source) throw new Error(`语音句子 ${chunkIndex + 1} 未返回音频`)
        if (generation === generationRef.current) state.sources.set(chunkIndex, source)
        return source
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        if (generation === generationRef.current) state.error = message
        console.warn("[Chat][TTS] 流式句子合成失败", error)
        return null
      })
      .finally(() => {
        if (generation !== generationRef.current) return
        state.pending = Math.max(0, state.pending - 1)
        updateStreamingClip(state)
      })

    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        const source = await synthesis
        if (!source || generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) return
        await playSources(
          state.segmentId,
          [source],
          generation,
          playbackGeneration,
          "auto",
          `${state.streamKey}:tts:${chunkIndex}`,
        )
      })
      .catch((error) => console.warn("[Chat][TTS] 流式句子播放失败", error))
  }

  const toggle = (segmentId: string, rawText: string, messageId: string) => {
    const clip = clips[segmentId]
    const sources = clip?.sources ?? (clip?.source ? [clip.source] : [])
    if (!sources.length) {
      void synthesize(segmentId, messageId, rawText, false)?.then((synthesizedSources) => {
        if (!synthesizedSources) return
        stop(false)
        void playSources(
          segmentId,
          synthesizedSources,
          generationRef.current,
          playbackGenerationRef.current,
          "manual",
        ).catch((error) => console.warn("[Chat][TTS] 播放失败", error))
      })
      return
    }
    if (audioSegmentIdRef.current === segmentId && audioRef.current) {
      if (audioRef.current.paused) {
        setPaused(false)
        void audioRef.current.play().catch(() => finishAudioRef.current?.())
      } else {
        audioRef.current.pause()
        setPaused(true)
      }
      return
    }
    stop(false)
    void playSources(segmentId, sources, generationRef.current, playbackGenerationRef.current, "manual")
      .catch((error) => console.warn("[Chat][TTS] 播放失败", error))
  }

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void listenDesktopSpeechPlaybackControl((control) => {
      if (control.type === "stop" && speechLeaseRef.current === control.leaseId) stop(false)
    }).then((listener) => {
      if (disposed) listener?.()
      else unsubscribe = listener
    })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  useEffect(() => () => {
    stop(true)
    void updateDesktopActivityFacts({ surface: "main-chat", tts_playing: false })
  }, [])

  useEffect(() => {
    void updateDesktopActivityFacts({
      surface: "main-chat",
      tts_playing: Boolean(activeSegmentId) && !paused,
    })
  }, [activeSegmentId, paused])

  useEffect(() => {
    const context = `${sessionId ?? ""}:${mode}`
    if (synthesisContextRef.current === context) return
    synthesisContextRef.current = context
    stop(true, true)
    runActiveRef.current = isThinking
    outputGateRef.current?.reset(isThinking)
  }, [isThinking, mode, sessionId])

  useEffect(() => {
    if (mode === "none") {
      stop(true, true)
      runActiveRef.current = isThinking
      outputGateRef.current?.reset(isThinking)
      return
    }
    if (!sessionId || typeof configId !== "number") {
      runActiveRef.current = isThinking
      outputGateRef.current?.reset(isThinking)
      return
    }
    const runWasActive = runActiveRef.current
    if (isThinking) {
      runActiveRef.current = true
      outputGateRef.current?.begin()
    }
    if (isThinking || runWasActive) {
      for (const [textSegmentIndex, segment] of segments.entries()) {
        if (!textForTTS(segment.text, mode)) continue
        const streamKey = speechStreamKey(segment.messageId, textSegmentIndex)
        let state = streamStatesRef.current.get(streamKey)
        if (!state) {
          state = {
            segmentId: segment.id,
            streamKey,
            nextChunkIndex: 0,
            pending: 0,
            sources: new Map(),
            complete: false,
          }
          streamStatesRef.current.set(streamKey, state)
        } else {
          state.segmentId = segment.id
        }
        const flush = segment.state !== "streaming" || (!isThinking && runWasActive)
        const update = consumeSpeechStream(segment.text, mode, state.cursor, flush)
        state.cursor = update.cursor
        for (const text of update.chunks) {
          const chunkIndex = state.nextChunkIndex
          state.nextChunkIndex += 1
          enqueueStreamingChunk(segment.messageId, text, chunkIndex, state)
        }
        if (flush) {
          state.complete = true
          updateStreamingClip(state)
        }
      }
    }
    if (!isThinking && runWasActive) {
      runActiveRef.current = false
      outputGateRef.current?.holdUntil(queueRef.current)
    }
  }, [configId, isThinking, mode, segments, sessionId])

  return {
    clips,
    activeSegmentId,
    paused,
    toggle,
    stop,
    autoPlaybackPending: autoPlaybackPending || Boolean(activeSegmentId),
  }
}
