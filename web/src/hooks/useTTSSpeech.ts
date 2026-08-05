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
import { listMessageSpeechSegments, synthesizeSpeechSegment } from "../lib/mon_agent_api"
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

export interface SpeechProgress {
  segmentId: string
  currentTime: number
  duration: number
}

export interface SpeechSegment {
  id: string
  messageId: string
  text: string
  state?: "streaming" | "done"
  configId?: number | null
}

interface StreamingSpeechState {
  segmentId: string
  streamKey: string
  groupIndex: number
  cursor?: SpeechStreamCursor
  nextChunkIndex: number
  pending: number
  sources: Map<number, string>
  complete: boolean
  error?: string
  configId: number
}

interface SpeechTimeline {
  segmentId: string
  sources: string[]
  durations: number[]
  currentIndex: number
  pendingSeek?: { index: number; offset: number; play: boolean }
}

interface SpeechScrubState {
  segmentId: string
  active: boolean
  resumeAfter: boolean
}

interface UseTTSSpeechOptions {
  sessionId?: string
  mode: PetTTSMode
  isThinking: boolean
  segments: SpeechSegment[]
  activeSegments: SpeechSegment[]
}

async function speechTextHash(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim()))
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

export function useTTSSpeech({ sessionId, mode, isThinking, segments, activeSegments }: UseTTSSpeechOptions) {
  const [clips, setClips] = useState<Record<string, SpeechClip>>({})
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [autoPlaybackPending, setAutoPlaybackPending] = useState(isThinking)
  const [paused, setPaused] = useState(false)
  const progressRef = useRef<SpeechProgress | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioSegmentIdRef = useRef<string | null>(null)
  const finishAudioRef = useRef<((reason?: "seek") => void) | null>(null)
  const timelineRef = useRef<SpeechTimeline | null>(null)
  const scrubStateRef = useRef<SpeechScrubState | null>(null)
  const durationCacheRef = useRef<Map<string, number>>(new Map())
  const generationRef = useRef(0)
  const playbackGenerationRef = useRef(0)
  const synthesisQueuesRef = useRef<Map<string, Promise<void>>>(new Map())
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const runActiveRef = useRef(isThinking)
  const streamStatesRef = useRef<Map<string, StreamingSpeechState>>(new Map())
  const speechLeaseRef = useRef<string | null>(null)
  const synthesisContextRef = useRef(`${sessionId ?? ""}:${mode}`)
  const outputGateRef = useRef<SpeechOutputGate | null>(null)
  if (!outputGateRef.current) {
    outputGateRef.current = new SpeechOutputGate(isThinking, setAutoPlaybackPending)
  }
  const restoreSignature = segments
    .map((segment) => `${segment.messageId}:${segment.id}:${segment.state ?? ""}:${segment.text}`)
    .join("\u001f")

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
    synthesisQueuesRef.current.clear()
    queueRef.current = Promise.resolve()
    setActiveSegmentId(null)
    setPaused(false)
    progressRef.current = null
    timelineRef.current = null
    scrubStateRef.current = null
    if (clearClips) {
      durationCacheRef.current.clear()
      setClips({})
    }
  }

  const sourceDuration = (source: string) => {
    const cached = durationCacheRef.current.get(source)
    if (cached !== undefined) return Promise.resolve(cached)
    return new Promise<number>((resolve) => {
      const probe = new Audio()
      probe.preload = "metadata"
      let settled = false
      const settle = (duration: number) => {
        if (settled) return
        settled = true
        const normalized = Number.isFinite(duration) ? Math.max(0, duration) : 0
        durationCacheRef.current.set(source, normalized)
        probe.removeEventListener("loadedmetadata", handleMetadata)
        probe.removeEventListener("error", handleError)
        probe.removeAttribute("src")
        probe.load()
        resolve(normalized)
      }
      const handleMetadata = () => settle(probe.duration)
      const handleError = () => settle(0)
      probe.addEventListener("loadedmetadata", handleMetadata, { once: true })
      probe.addEventListener("error", handleError, { once: true })
      probe.src = source
    })
  }

  const timelineOffset = (durations: number[], index: number) =>
    durations.slice(0, index).reduce((total, duration) => total + duration, 0)

  const playSource = (
    segmentId: string,
    source: string,
    generation: number,
    timeline: SpeechTimeline,
    sourceIndex: number,
    initialTime = 0,
    autoPlay = true,
  ) => new Promise<"ended" | "seek">((resolve, reject) => {
    if (generation !== generationRef.current) {
      resolve("ended")
      return
    }
    const audio = new Audio(source)
    let settled = false
    const finish = (reason: "ended" | "seek" = "ended", error?: unknown) => {
      if (settled) return
      settled = true
      if (finishAudioRef.current === finish) finishAudioRef.current = null
      if (audioRef.current === audio) audioRef.current = null
      if (audioSegmentIdRef.current === segmentId) audioSegmentIdRef.current = null
      if (reason !== "seek" || !scrubStateRef.current?.active) setPaused(false)
      if (error) reject(error)
      else resolve(reason)
    }
    audioRef.current = audio
    audioSegmentIdRef.current = segmentId
    finishAudioRef.current = (reason) => finish(reason ?? "ended")
    setActiveSegmentId(segmentId)
    setPaused(!autoPlay)
    timeline.currentIndex = sourceIndex
    const totalDuration = timeline.durations.reduce((total, duration) => total + duration, 0)
    const sourceOffset = timelineOffset(timeline.durations, sourceIndex)
    progressRef.current = { segmentId, currentTime: sourceOffset + initialTime, duration: totalDuration }
    const updateProgress = () => {
      if (audioRef.current !== audio) return
      if (Number.isFinite(audio.duration) && audio.duration > 0 && timeline.durations[sourceIndex] !== audio.duration) {
        timeline.durations[sourceIndex] = audio.duration
        durationCacheRef.current.set(source, audio.duration)
      }
      progressRef.current = {
        segmentId,
        currentTime: timelineOffset(timeline.durations, sourceIndex) + (Number.isFinite(audio.currentTime) ? audio.currentTime : 0),
        duration: timeline.durations.reduce((total, duration) => total + duration, 0),
      }
    }
    audio.addEventListener("loadedmetadata", () => {
      audio.currentTime = Math.min(initialTime, Number.isFinite(audio.duration) ? audio.duration : initialTime)
      updateProgress()
      if (autoPlay) void audio.play().catch((error) => finish("ended", error))
    }, { once: true })
    audio.addEventListener("durationchange", updateProgress)
    audio.addEventListener("timeupdate", updateProgress)
    audio.addEventListener("ended", () => finish(), { once: true })
    audio.addEventListener("error", () => finish("ended", new Error(`语音段 ${segmentId} 播放失败`)), { once: true })
  })

  const playSources = async (
    segmentId: string,
    sources: string[],
    generation: number,
    playbackGeneration: number,
    intent: DesktopSpeechIntent,
    speechKey = segmentId,
    startIndex = 0,
  ) => {
    if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) return
    const durations = await Promise.all(sources.map(sourceDuration))
    if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) return
    const claim = await claimDesktopSpeechPlayback("main-chat", speechKey, intent)
    if (!claim.granted || !claim.leaseId) return
    if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) {
      void releaseDesktopSpeechPlayback(claim.leaseId)
      return
    }
    speechLeaseRef.current = claim.leaseId
    const normalizedStartIndex = Math.max(0, Math.min(startIndex, sources.length - 1))
    const timeline: SpeechTimeline = { segmentId, sources, durations, currentIndex: normalizedStartIndex }
    timelineRef.current = timeline
    setActiveSegmentId(segmentId)
    setPaused(false)
    try {
      let sourceIndex = normalizedStartIndex
      let initialTime = 0
      let shouldPlay = true
      while (sourceIndex < sources.length) {
        if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current) return
        const result = await playSource(
          segmentId,
          sources[sourceIndex],
          generation,
          timeline,
          sourceIndex,
          initialTime,
          shouldPlay,
        )
        const pendingSeek = timeline.pendingSeek
        timeline.pendingSeek = undefined
        if (result === "seek" && pendingSeek) {
          sourceIndex = pendingSeek.index
          initialTime = pendingSeek.offset
          const scrub = scrubStateRef.current
          shouldPlay = pendingSeek.play || Boolean(
            scrub?.segmentId === segmentId && !scrub.active && scrub.resumeAfter,
          )
          continue
        }
        sourceIndex += 1
        initialTime = 0
        shouldPlay = true
      }
    } finally {
      if (speechLeaseRef.current === claim.leaseId) speechLeaseRef.current = null
      void releaseDesktopSpeechPlayback(claim.leaseId)
      setActiveSegmentId((current) => current === segmentId ? null : current)
      setPaused(false)
      if (progressRef.current?.segmentId === segmentId) progressRef.current = null
      if (timelineRef.current === timeline) timelineRef.current = null
    }
  }

  const synthesize = (segmentId: string, messageId: string, rawText: string, configId: number | null | undefined, autoPlay: boolean) => {
    const chunks = speechChunksForTTS(rawText, mode)
    if (!chunks.length || !sessionId || !messageId || typeof configId !== "number" || mode === "none") return

    const generation = generationRef.current
    const groupIndex = Math.max(0, segments
      .filter((segment) => segment.messageId === messageId)
      .findIndex((segment) => segment.id === segmentId))
    const playbackGeneration = playbackGenerationRef.current
    setClips((current) => ({ ...current, [segmentId]: { status: "synthesizing" } }))
    const synthesis = (async () => {
      const sources: string[] = []
      for (const [index, text] of chunks.entries()) {
        const result = await synthesizeSpeechSegment({
          sessionId,
          messageId,
          segmentGroupId: segmentId,
          groupIndex,
          sequence: index,
          text,
          configId,
          mode,
        })
        if (!result.success) throw new Error(result.error_message || `语音段 ${index + 1}/${chunks.length} 合成失败`)
        const source = resolveCoreAssetUrl(result.audio_url)
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
    const configId = state.configId
    if (!sessionId || !messageId || mode === "none") return
    const generation = generationRef.current
    const playbackGeneration = playbackGenerationRef.current
    state.pending += 1
    updateStreamingClip(state)

    const previousRequest = synthesisQueuesRef.current.get(messageId) ?? Promise.resolve()
    const request = previousRequest
      .then(async () => {
        let lastError: unknown
        for (const delayMs of [0, 150, 400, 900]) {
          if (delayMs) await new Promise((resolve) => window.setTimeout(resolve, delayMs))
          try {
            const result = await synthesizeSpeechSegment({
              sessionId,
              messageId,
              segmentGroupId: state.segmentId,
              groupIndex: state.groupIndex,
              sequence: chunkIndex,
              text,
              configId,
              mode,
            })
            if (!result.success) throw new Error(result.error_message || `语音句子 ${chunkIndex + 1} 合成失败`)
            return result
          } catch (error) {
            lastError = error
          }
        }
        throw lastError instanceof Error ? lastError : new Error(`语音句子 ${chunkIndex + 1} 合成失败`)
      })
    synthesisQueuesRef.current.set(messageId, request.then(() => undefined, () => undefined))
    const synthesis = request
      .then((result) => {
        const source = resolveCoreAssetUrl(result.audio_url)
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
        const availableSources = [...state.sources.entries()]
          .filter(([index]) => index <= chunkIndex)
          .sort(([left], [right]) => left - right)
          .map(([, availableSource]) => availableSource)
        await playSources(
          state.segmentId,
          availableSources,
          generation,
          playbackGeneration,
          "auto",
          `${state.streamKey}:tts:${chunkIndex}`,
          Math.max(0, availableSources.length - 1),
        )
      })
      .catch((error) => console.warn("[Chat][TTS] 流式句子播放失败", error))
  }

  const toggle = (segmentId: string, rawText: string, messageId: string) => {
    const clip = clips[segmentId]
    const sources = clip?.sources ?? (clip?.source ? [clip.source] : [])
    if (!sources.length) {
      const segmentConfigId = segments.find((segment) => segment.id === segmentId)?.configId
      void synthesize(segmentId, messageId, rawText, segmentConfigId, false)?.then((synthesizedSources) => {
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

  const seek = (segmentId: string, time: number) => {
    const timeline = timelineRef.current
    const audio = audioRef.current
    if (!timeline || timeline.segmentId !== segmentId || !audio || audioSegmentIdRef.current !== segmentId || !Number.isFinite(time)) return
    const totalDuration = timeline.durations.reduce((total, duration) => total + duration, 0)
    const target = Math.max(0, Math.min(time, totalDuration))
    let offset = target
    let index = timeline.durations.length - 1
    for (let candidate = 0; candidate < timeline.durations.length; candidate += 1) {
      const duration = timeline.durations[candidate]
      if (offset <= duration || candidate === timeline.durations.length - 1) {
        index = candidate
        break
      }
      offset -= duration
    }
    if (index === timeline.currentIndex) {
      audio.currentTime = Math.max(0, Math.min(offset, Number.isFinite(audio.duration) ? audio.duration : offset))
      progressRef.current = { segmentId, currentTime: target, duration: totalDuration }
      return
    }
    const scrub = scrubStateRef.current
    const playAfterSeek = scrub?.segmentId === segmentId && scrub.active ? false : !audio.paused
    timeline.pendingSeek = { index, offset, play: playAfterSeek }
    progressRef.current = { segmentId, currentTime: target, duration: totalDuration }
    audio.pause()
    finishAudioRef.current?.("seek")
  }

  const beginSeek = (segmentId: string) => {
    const audio = audioRef.current
    if (!audio || audioSegmentIdRef.current !== segmentId) return
    scrubStateRef.current = {
      segmentId,
      active: true,
      resumeAfter: !audio.paused,
    }
    if (!audio.paused) {
      audio.pause()
      setPaused(true)
    }
  }

  const endSeek = (segmentId: string) => {
    const scrub = scrubStateRef.current
    if (!scrub || scrub.segmentId !== segmentId || !scrub.active) return
    scrub.active = false
    if (!scrub.resumeAfter) return
    const audio = audioRef.current
    if (audio && audioSegmentIdRef.current === segmentId && audio.paused) {
      setPaused(false)
      void audio.play().catch(() => finishAudioRef.current?.())
    }
  }

  const getProgress = (segmentId: string) => {
    const progress = progressRef.current
    return progress?.segmentId === segmentId ? progress : null
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
    if (!sessionId || mode === "none" || isThinking) return
    const generation = generationRef.current
    void listMessageSpeechSegments(sessionId).then(async (persisted) => {
      for (const segment of segments) {
        const chunks = speechChunksForTTS(segment.text, mode)
        const saved = persisted
          .filter((item) => item.external_message_id === segment.messageId && item.segment_group_id === segment.id)
          .sort((left, right) => left.sequence - right.sequence)
        if (!chunks.length || saved.length !== chunks.length) continue
        const hashes = await Promise.all(chunks.map(speechTextHash))
        if (saved.some((item, index) => item.sequence !== index || item.text_hash !== hashes[index])) continue
        const sources = saved.map((item) => resolveCoreAssetUrl(item.audio_url)).filter((url): url is string => Boolean(url))
        if (sources.length !== saved.length || generation !== generationRef.current) continue
        setClips((current) => ({
          ...current,
          [segment.id]: { status: "ready", source: sources[0], sources },
        }))
      }
    }).catch((error) => console.warn("[Chat][TTS] 恢复持久化语音失败", error))
  }, [isThinking, mode, restoreSignature, sessionId])

  useEffect(() => {
    if (mode === "none") {
      stop(true, true)
      runActiveRef.current = isThinking
      outputGateRef.current?.reset(isThinking)
      return
    }
    if (!sessionId) {
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
      const messageGroupIndexes = new Map<string, number>()
      for (const segment of activeSegments) {
        const textSegmentIndex = messageGroupIndexes.get(segment.messageId) ?? 0
        messageGroupIndexes.set(segment.messageId, textSegmentIndex + 1)
        if (typeof segment.configId !== "number") continue
        if (!textForTTS(segment.text, mode)) continue
        const streamKey = speechStreamKey(segment.messageId, textSegmentIndex)
        let state = streamStatesRef.current.get(streamKey)
        if (!state) {
          state = {
            segmentId: segment.id,
            streamKey,
            groupIndex: textSegmentIndex,
            nextChunkIndex: 0,
            pending: 0,
            sources: new Map(),
            complete: false,
            configId: segment.configId,
          }
          streamStatesRef.current.set(streamKey, state)
        } else {
          state.segmentId = segment.id
          state.groupIndex = textSegmentIndex
          state.configId = segment.configId
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
  }, [activeSegments, isThinking, mode, sessionId])

  return {
    clips,
    activeSegmentId,
    paused,
    toggle,
    seek,
    beginSeek,
    endSeek,
    getProgress,
    stop,
    autoPlaybackPending: autoPlaybackPending || Boolean(activeSegmentId),
  }
}
