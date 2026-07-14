import { useEffect, useRef, useState } from "react"
import { resolveCoreAssetUrl } from "../lib/auth"
import { updateDesktopActivityFacts, type PetTTSMode } from "../lib/desktop-window"
import { synthesizeSpeechSegment } from "../lib/mon_agent_api"
import { textForTTS } from "../lib/tts-text"

export interface SpeechClip {
  status: "synthesizing" | "ready" | "error"
  source?: string
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

  const play = (segmentId: string, source: string, generation: number) => new Promise<void>((resolve, reject) => {
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
      setActiveSegmentId((current) => current === segmentId ? null : current)
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

  const synthesize = (segmentId: string, messageId: string, rawText: string, autoPlay: boolean) => {
    const text = textForTTS(rawText, mode)
    if (!text || !sessionId || !messageId || typeof configId !== "number" || mode === "none") return

    const generation = generationRef.current
    const playbackGeneration = playbackGenerationRef.current
    setClips((current) => ({ ...current, [segmentId]: { status: "synthesizing" } }))
    const synthesis = synthesizeSpeechSegment({
      sessionId,
      messageId,
      segmentId,
      text,
      configId,
      mode,
    })
      .then((result) => {
        if (!result.success) throw new Error(result.error_message || `语音段 ${segmentId} 合成失败`)
        const source = result.audio_data
          ? `data:audio/wav;base64,${result.audio_data}`
          : resolveCoreAssetUrl(result.audio_url)
        if (!source) throw new Error(`语音段 ${segmentId} 未返回音频`)
        if (generation === generationRef.current) {
          setClips((current) => ({ ...current, [segmentId]: { status: "ready", source } }))
        }
        return source
      })
      .catch((error) => {
        if (generation === generationRef.current) {
          setClips((current) => ({ ...current, [segmentId]: { status: "error" } }))
        }
        console.warn("[Chat][TTS] 合成失败", error)
        return null
      })

    if (!autoPlay) return synthesis
    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        const source = await synthesis
        if (!source || generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) return
        await play(segmentId, source, generation)
      })
      .catch((error) => console.warn("[Chat][TTS] 播放失败", error))
    return synthesis
  }

  const toggle = (segmentId: string, rawText: string, messageId: string) => {
    const clip = clips[segmentId]
    if (!clip?.source) {
      void synthesize(segmentId, messageId, rawText, false)?.then((source) => {
        if (!source) return
        stop(false)
        void play(segmentId, source, generationRef.current).catch((error) => console.warn("[Chat][TTS] 播放失败", error))
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
    void play(segmentId, clip.source, generationRef.current).catch((error) => console.warn("[Chat][TTS] 播放失败", error))
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
      return
    }
    const runWasActive = runActiveRef.current
    if (isThinking) runActiveRef.current = true
    if (isThinking || runWasActive) {
      for (const segment of segments) {
        if (synthesizedIdsRef.current.has(segment.id) || !textForTTS(segment.text, mode)) continue
        synthesizedIdsRef.current.add(segment.id)
        void synthesize(segment.id, segment.messageId, segment.text, true)
      }
    }
    if (!isThinking && runWasActive) runActiveRef.current = false
  }, [configId, isThinking, mode, segments, sessionId])

  return { clips, activeSegmentId, paused, toggle, stop }
}
