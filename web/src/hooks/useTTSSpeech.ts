import { useEffect, useRef, useState } from "react"
import { resolveCoreAssetUrl } from "../lib/auth"
import { updateDesktopActivityFacts, type PetTTSMode } from "../lib/desktop-window"
import { synthesizeSpeechSegment } from "../lib/mon_agent_api"
import { speechChunksForTTS, textForTTS } from "../lib/tts-text"

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
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const runActiveRef = useRef(isThinking)
  const synthesizedIdsRef = useRef<Set<string>>(new Set())

  const stop = (cancelSynthesis = false, clearClips = false) => {
    playbackGenerationRef.current += 1
    if (cancelSynthesis) generationRef.current += 1
    audioRef.current?.pause()
    audioRef.current = null
    audioSegmentIdRef.current = null
    finishAudioRef.current?.()
    finishAudioRef.current = null
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
  ) => {
    if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) return
    setActiveSegmentId(segmentId)
    setPaused(false)
    try {
      for (const source of sources) {
        if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) return
        await playSource(segmentId, source, generation)
      }
    } finally {
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
        await playSources(segmentId, sources, generation, playbackGeneration)
      })
      .catch((error) => console.warn("[Chat][TTS] 播放失败", error))
    return synthesis
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
    void playSources(segmentId, sources, generationRef.current, playbackGenerationRef.current)
      .catch((error) => console.warn("[Chat][TTS] 播放失败", error))
  }

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
    if (mode === "none") {
      stop(true, true)
      runActiveRef.current = isThinking
      setAutoPlaybackPending(isThinking)
      return
    }
    const runWasActive = runActiveRef.current
    if (isThinking) {
      runActiveRef.current = true
      setAutoPlaybackPending(true)
    }
    const queued: Array<Promise<unknown>> = []
    if (isThinking || runWasActive) {
      for (const segment of segments) {
        if (synthesizedIdsRef.current.has(segment.id) || !textForTTS(segment.text, mode)) continue
        synthesizedIdsRef.current.add(segment.id)
        const result = synthesize(segment.id, segment.messageId, segment.text, true)
        if (result) queued.push(result)
      }
    }
    if (!isThinking && runWasActive) {
      runActiveRef.current = false
      const generation = generationRef.current
      void Promise.allSettled(queued).then(async () => {
        await queueRef.current.catch(() => undefined)
        if (generation === generationRef.current) setAutoPlaybackPending(false)
      })
    } else if (!isThinking && !runWasActive) {
      setAutoPlaybackPending(false)
    }
  }, [configId, isThinking, mode, segments, sessionId])

  return {
    clips,
    activeSegmentId,
    paused,
    toggle,
    stop,
    autoPlaybackPending: autoPlaybackPending || (Boolean(activeSegmentId) && !paused),
  }
}
