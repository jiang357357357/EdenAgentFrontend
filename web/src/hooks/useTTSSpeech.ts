import { useCallback, useEffect, useRef, useState } from "react"
import { resolveVoiceBlobUrl } from "../lib/rpc-transport"
import {
  authorizeAutomaticSpeechSynthesis,
  claimDesktopSpeechPlayback,
  listenDesktopSpeechPlaybackControl,
  releaseDesktopSpeechPlayback,
  reportSpeechDiagnostic,
  updateDesktopActivityFacts,
  type DesktopSpeechIntent,
  type DesktopSpeechSurface,
  type PetTTSMode,
} from "../lib/desktop-window"
import { listMessageSpeechSegments, synthesizeSpeechSegment } from "../lib/agent-client"
import { SpeechOutputGate } from "../lib/speech-output-gate"
import {
  isSpeechTaskCancelled,
  SpeechPlaybackQueue,
  SpeechTaskCancelledError,
  SpeechSynthesisScheduler,
  throwIfSpeechTaskCancelled,
} from "../lib/speech-task-queue"
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
  streamEpoch?: number
  streamResetReason?: string
  configId?: number | null
}

export interface SpeechMessageRevision {
  messageId: string
  epoch: number
  reason?: string
}

interface StreamingSpeechState {
  messageId: string
  segmentId: string
  streamKey: string
  persistenceGroupId: string
  messageGeneration: number
  groupIndex: number
  cursor?: SpeechStreamCursor
  nextChunkIndex: number
  pending: number
  sources: Map<number, string>
  complete: boolean
  error?: string
  configId: number
  playbackOrder: number
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

interface StopPlaybackOptions {
  cancelSynthesis?: boolean
  cancelPlaybackQueue?: boolean
  clearClips?: boolean
  disableAutomaticPlayback?: boolean
  resetOutputGate?: boolean
  reason: string
}

interface UseTTSSpeechOptions {
  audioOutputDeviceId?: string
  sessionId?: string
  mode: PetTTSMode
  isThinking: boolean
  segments: SpeechSegment[]
  activeSegments: SpeechSegment[]
  messageRevisions: SpeechMessageRevision[]
  surface?: DesktopSpeechSurface
  speechRate?: number
  speechVolume?: number
}

async function speechTextHash(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim()))
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

const AUDIO_METADATA_TIMEOUT_MS = 12_000
const AUDIO_STALL_TIMEOUT_MS = 30_000

function waitForSpeechRetry(delayMs: number, signal: AbortSignal) {
  if (!delayMs) {
    throwIfSpeechTaskCancelled(signal)
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort)
      resolve()
    }, delayMs)
    const handleAbort = () => {
      window.clearTimeout(timeoutId)
      reject(new SpeechTaskCancelledError())
    }
    signal.addEventListener("abort", handleAbort, { once: true })
    if (signal.aborted) handleAbort()
  })
}

export function useTTSSpeech({
  audioOutputDeviceId = "default",
  sessionId,
  mode,
  isThinking,
  segments,
  activeSegments,
  messageRevisions,
  surface = "main-chat",
  speechRate = 1,
  speechVolume = 100,
}: UseTTSSpeechOptions) {
  const [clips, setClips] = useState<Record<string, SpeechClip>>({})
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [autoPlaybackPending, setAutoPlaybackPending] = useState(isThinking)
  const [paused, setPaused] = useState(false)
  const progressRef = useRef<SpeechProgress | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioSegmentIdRef = useRef<string | null>(null)
  const finishAudioRef = useRef<((reason?: "seek" | "interrupted") => void) | null>(null)
  const timelineRef = useRef<SpeechTimeline | null>(null)
  const scrubStateRef = useRef<SpeechScrubState | null>(null)
  const durationCacheRef = useRef<Map<string, number>>(new Map())
  const generationRef = useRef(0)
  const playbackGenerationRef = useRef(0)
  const synthesisSchedulerRef = useRef(new SpeechSynthesisScheduler())
  const playbackQueueRef = useRef(new SpeechPlaybackQueue((error, taskId) => {
    console.warn(`[Chat][TTS] 播放任务 ${taskId} 失败`, error)
  }))
  const runActiveRef = useRef(isThinking)
  const runBaselineMessageIdsRef = useRef<Set<string>>(new Set())
  const streamStatesRef = useRef<Map<string, StreamingSpeechState>>(new Map())
  const messageEpochsRef = useRef<Map<string, number>>(new Map())
  const messageGenerationsRef = useRef<Map<string, number>>(new Map())
  const nextStreamOrderRef = useRef(0)
  const automaticPlaybackEnabledRef = useRef(isThinking)
  const speechLeaseRef = useRef<string | null>(null)
  const diagnosticContextRef = useRef({ sessionId, surface })
  diagnosticContextRef.current = { sessionId, surface }
  const synthesisContextRef = useRef(`${sessionId ?? ""}:${mode}:${surface}`)
  const outputGateRef = useRef<SpeechOutputGate | null>(null)
  if (!outputGateRef.current) {
    outputGateRef.current = new SpeechOutputGate(isThinking, setAutoPlaybackPending)
  }
  const restoreSignature = segments
    .map((segment) => `${segment.messageId}:${segment.id}:${segment.streamEpoch ?? 0}:${segment.state ?? ""}:${segment.text}`)
    .join("\u001f")
  const activeMessageRevisions = new Map(
    messageRevisions.map((revision) => [revision.messageId, { epoch: revision.epoch, reason: revision.reason }]),
  )
  const activeMessageRevisionSignature = [...activeMessageRevisions]
    .map(([messageId, revision]) => `${messageId}:${revision.epoch}:${revision.reason ?? ""}`)
    .join("\u001f")

  const diagnose = (event: string, details: Record<string, unknown> = {}) => {
    const context = diagnosticContextRef.current
    void reportSpeechDiagnostic(event, {
      sessionId: context.sessionId ?? null,
      hookSurface: context.surface,
      ...details,
    })
  }

  const currentMessageGeneration = (messageId: string) =>
    messageGenerationsRef.current.get(messageId) ?? 0

  const isCurrentMessageGeneration = (messageId: string, generation: number) =>
    currentMessageGeneration(messageId) === generation

  const invalidateMessageSpeech = (
    messageId: string,
    reason: string,
    previousEpoch?: number,
    nextEpoch?: number,
  ) => {
    const previousGeneration = currentMessageGeneration(messageId)
    const nextGeneration = previousGeneration + 1
    messageGenerationsRef.current.set(messageId, nextGeneration)
    const synthesisCancelled = synthesisSchedulerRef.current.cancelLane(messageId)
    const pendingPlaybackCancelled = playbackQueueRef.current.cancelScope(messageId)
    const affectedSegmentIds = new Set<string>()
    let removedStreamStates = 0
    let cancelledPlaybackGroups = 0
    for (const [streamKey, state] of streamStatesRef.current) {
      if (state.messageId !== messageId) continue
      affectedSegmentIds.add(state.segmentId)
      if (playbackQueueRef.current.cancelGroup(streamKey)) cancelledPlaybackGroups += 1
      streamStatesRef.current.delete(streamKey)
      removedStreamStates += 1
    }
    for (const segment of segments) {
      if (segment.messageId === messageId) affectedSegmentIds.add(segment.id)
    }
    if (affectedSegmentIds.size) {
      setClips((current) => {
        const next = { ...current }
        for (const segmentId of affectedSegmentIds) delete next[segmentId]
        return next
      })
    }
    diagnose("message-stream-invalidated", {
      messageId,
      reason,
      previousEpoch: previousEpoch ?? null,
      nextEpoch: nextEpoch ?? null,
      previousGeneration,
      nextGeneration,
      synthesisCancelled,
      pendingPlaybackCancelled,
      cancelledPlaybackGroups,
      removedStreamStates,
      activeSegmentId: audioSegmentIdRef.current,
      activeMessagePreserved: segments.some(
        (segment) => segment.id === audioSegmentIdRef.current && segment.messageId === messageId,
      ),
    })
    return nextGeneration
  }

  const stopPlayback = ({
    cancelSynthesis = false,
    cancelPlaybackQueue = true,
    clearClips = false,
    disableAutomaticPlayback = true,
    resetOutputGate = true,
    reason,
  }: StopPlaybackOptions) => {
    diagnose("playback-stop", {
      reason,
      cancelSynthesis,
      cancelPlaybackQueue,
      clearClips,
      disableAutomaticPlayback,
      leaseId: speechLeaseRef.current,
      activeSegmentId: audioSegmentIdRef.current,
      pendingPlaybackCount: playbackQueueRef.current.pendingCount,
    })
    if (resetOutputGate) outputGateRef.current?.reset(false)
    if (cancelPlaybackQueue) playbackGenerationRef.current += 1
    if (disableAutomaticPlayback) automaticPlaybackEnabledRef.current = false
    if (cancelSynthesis) {
      generationRef.current += 1
      synthesisSchedulerRef.current.cancelAll()
      streamStatesRef.current.clear()
      nextStreamOrderRef.current = 0
    }
    audioRef.current?.pause()
    audioRef.current = null
    audioSegmentIdRef.current = null
    finishAudioRef.current?.("interrupted")
    finishAudioRef.current = null
    if (cancelPlaybackQueue) playbackQueueRef.current.cancel()
    const leaseId = speechLeaseRef.current
    speechLeaseRef.current = null
    void releaseDesktopSpeechPlayback(leaseId, "interrupted")
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

  const stop = (cancelSynthesis = false, clearClips = false, reason?: string) => {
    stopPlayback({
      cancelSynthesis,
      cancelPlaybackQueue: true,
      clearClips,
      disableAutomaticPlayback: true,
      reason: reason ?? (cancelSynthesis ? "context-cancelled" : "user-stop"),
    })
  }

  const sourceDuration = (source: string, signal?: AbortSignal) => {
    const cached = durationCacheRef.current.get(source)
    if (cached !== undefined) return Promise.resolve(cached)
    return new Promise<number>((resolve) => {
      const probe = new Audio()
      probe.preload = "metadata"
      let settled = false
      const timeoutId = window.setTimeout(() => settle(0), AUDIO_METADATA_TIMEOUT_MS)
      const settle = (duration: number) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        const normalized = Number.isFinite(duration) ? Math.max(0, duration) : 0
        if (normalized > 0) durationCacheRef.current.set(source, normalized)
        probe.removeEventListener("loadedmetadata", handleMetadata)
        probe.removeEventListener("error", handleError)
        signal?.removeEventListener("abort", handleAbort)
        probe.removeAttribute("src")
        probe.load()
        resolve(normalized)
      }
      const handleMetadata = () => settle(probe.duration)
      const handleError = () => settle(0)
      const handleAbort = () => settle(0)
      probe.addEventListener("loadedmetadata", handleMetadata, { once: true })
      probe.addEventListener("error", handleError, { once: true })
      signal?.addEventListener("abort", handleAbort, { once: true })
      if (signal?.aborted) {
        settle(0)
        return
      }
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
    signal?: AbortSignal,
  ) => new Promise<"ended" | "seek" | "interrupted">((resolve, reject) => {
    if (generation !== generationRef.current || signal?.aborted) {
      resolve("ended")
      return
    }
    const audio = new Audio(source)
    audio.volume = Math.max(0, Math.min(1, speechVolume / 100))
    audio.playbackRate = Math.max(0.5, Math.min(2, speechRate))
    if (audioOutputDeviceId !== "default" && "setSinkId" in audio) {
      void (audio as HTMLAudioElement & { setSinkId: (deviceId: string) => Promise<void> })
        .setSinkId(audioOutputDeviceId)
        .catch((error) => diagnose("playback-output-device-failed", {
          deviceId: audioOutputDeviceId,
          error: error instanceof Error ? error.message : String(error),
        }))
    }
    let settled = false
    let metadataTimeoutId: number | undefined
    let stallTimeoutId: number | undefined
    const clearStallTimeout = () => {
      if (stallTimeoutId !== undefined) window.clearTimeout(stallTimeoutId)
      stallTimeoutId = undefined
    }
    const clearTimers = () => {
      if (metadataTimeoutId !== undefined) window.clearTimeout(metadataTimeoutId)
      metadataTimeoutId = undefined
      clearStallTimeout()
    }
    const armStallTimeout = () => {
      if (stallTimeoutId !== undefined) window.clearTimeout(stallTimeoutId)
      if (audio.paused) {
        stallTimeoutId = undefined
        return
      }
      stallTimeoutId = window.setTimeout(() => {
        finish("ended", new Error(`语音段 ${segmentId} 播放超时`))
      }, AUDIO_STALL_TIMEOUT_MS)
    }
    const finish = (reason: "ended" | "seek" | "interrupted" = "ended", error?: unknown) => {
      if (settled) return
      settled = true
      clearTimers()
      signal?.removeEventListener("abort", handleAbort)
      if (finishAudioRef.current === finish) finishAudioRef.current = null
      if (audioRef.current === audio) audioRef.current = null
      if (audioSegmentIdRef.current === segmentId) audioSegmentIdRef.current = null
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
      if (reason !== "seek" || !scrubStateRef.current?.active) setPaused(false)
      if (error) reject(error)
      else resolve(reason)
    }
    const handleAbort = () => finish("ended")
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
    metadataTimeoutId = window.setTimeout(() => {
      finish("ended", new Error(`语音段 ${segmentId} 元数据加载超时`))
    }, AUDIO_METADATA_TIMEOUT_MS)
    signal?.addEventListener("abort", handleAbort, { once: true })
    audio.addEventListener("loadedmetadata", () => {
      if (metadataTimeoutId !== undefined) window.clearTimeout(metadataTimeoutId)
      metadataTimeoutId = undefined
      audio.currentTime = Math.min(initialTime, Number.isFinite(audio.duration) ? audio.duration : initialTime)
      updateProgress()
      if (autoPlay) void audio.play().catch((error) => finish("ended", error))
    }, { once: true })
    audio.addEventListener("durationchange", updateProgress)
    audio.addEventListener("timeupdate", () => {
      updateProgress()
      armStallTimeout()
    })
    audio.addEventListener("play", armStallTimeout)
    audio.addEventListener("playing", armStallTimeout)
    audio.addEventListener("pause", clearStallTimeout)
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
    preservePresentation = false,
    signal?: AbortSignal,
  ) => {
    if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current || signal?.aborted) return
    const durations = await Promise.all(sources.map((source) => sourceDuration(source, signal)))
    if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current || signal?.aborted) return
    diagnose("playback-claim-start", { segmentId, speechKey, intent, sourceCount: sources.length })
    let claim = await claimDesktopSpeechPlayback(surface, speechKey, intent)
    let claimAttempts = 1
    const claimStartedAt = Date.now()
    while (
      intent === "auto" &&
      !claim.granted &&
      (claim.reason === "automatic-playback-active" || claim.reason === "manual-playback-active") &&
      Date.now() - claimStartedAt < 60_000 &&
      generation === generationRef.current &&
      playbackGeneration === playbackGenerationRef.current &&
      !signal?.aborted
    ) {
      const retrySignal = signal ?? new AbortController().signal
      await waitForSpeechRetry(Math.min(1_000, 150 * claimAttempts), retrySignal)
      claimAttempts += 1
      claim = await claimDesktopSpeechPlayback(surface, speechKey, intent)
    }
    diagnose(claim.granted ? "playback-claim-granted" : "playback-claim-denied", {
      segmentId,
      speechKey,
      intent,
      reason: claim.reason ?? null,
      leaseId: claim.leaseId ?? null,
      attempts: claimAttempts,
    })
    if (!claim.granted || !claim.leaseId) return
    if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current || signal?.aborted) {
      void releaseDesktopSpeechPlayback(claim.leaseId, "interrupted")
      return
    }
    speechLeaseRef.current = claim.leaseId
    const normalizedStartIndex = Math.max(0, Math.min(startIndex, sources.length - 1))
    const timeline: SpeechTimeline = { segmentId, sources, durations, currentIndex: normalizedStartIndex }
    timelineRef.current = timeline
    setActiveSegmentId(segmentId)
    setPaused(false)
    let completed = false
    try {
      let sourceIndex = normalizedStartIndex
      let initialTime = 0
      let shouldPlay = true
      while (sourceIndex < sources.length) {
        if (generation !== generationRef.current || playbackGeneration !== playbackGenerationRef.current || signal?.aborted) return
        const result = await playSource(
          segmentId,
          sources[sourceIndex],
          generation,
          timeline,
          sourceIndex,
          initialTime,
          shouldPlay,
          signal,
        )
        if (result === "interrupted") {
          diagnose("playback-interrupted", { segmentId, speechKey, intent, sourceIndex })
          return
        }
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
      completed = true
      diagnose("playback-completed", { segmentId, speechKey, intent, sourceCount: sources.length })
    } catch (error) {
      diagnose("playback-failed", {
        segmentId,
        speechKey,
        intent,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      if (speechLeaseRef.current === claim.leaseId) speechLeaseRef.current = null
      void releaseDesktopSpeechPlayback(claim.leaseId, completed ? "completed" : "interrupted")
      setPaused(false)
      if (!preservePresentation) {
        setActiveSegmentId((current) => current === segmentId ? null : current)
        if (progressRef.current?.segmentId === segmentId) progressRef.current = null
      }
      if (timelineRef.current === timeline) timelineRef.current = null
    }
  }

  const synthesize = (segmentId: string, messageId: string, rawText: string, configId: number | null | undefined, autoPlay: boolean) => {
    const chunks = speechChunksForTTS(rawText, mode)
    if (!chunks.length || !sessionId || !messageId || typeof configId !== "number" || mode === "none") return

    const generation = generationRef.current
    const messageGeneration = currentMessageGeneration(messageId)
    const groupIndex = Math.max(0, segments
      .filter((segment) => segment.messageId === messageId)
      .findIndex((segment) => segment.id === segmentId))
    const segmentEpoch = segments.find((segment) => segment.id === segmentId)?.streamEpoch ?? 0
    const persistenceGroupId = speechStreamKey(messageId, groupIndex, segmentEpoch)
    const playbackGeneration = playbackGenerationRef.current
    setClips((current) => ({ ...current, [segmentId]: { status: "synthesizing" } }))
    const synthesis = (async () => {
      const sources: string[] = []
      for (const [index, text] of chunks.entries()) {
        const source = await synthesisSchedulerRef.current.schedule(messageId, async (signal) => {
          throwIfSpeechTaskCancelled(signal)
          const result = await synthesizeSpeechSegment({
            sessionId,
            messageId,
            segmentGroupId: persistenceGroupId,
            groupIndex,
            sequence: index,
            text,
            configId,
            mode,
          })
          throwIfSpeechTaskCancelled(signal)
          if (!result.success) throw new Error(result.error_message || `语音段 ${index + 1}/${chunks.length} 合成失败`)
          if (!result.audio_blob_id) throw new Error(`语音段 ${index + 1}/${chunks.length} 未返回音频`)
          const resolved = await resolveVoiceBlobUrl(result.audio_blob_id)
          throwIfSpeechTaskCancelled(signal)
          return resolved
        })
        sources.push(source)
      }

      if (!sources.length) throw new Error(`语音段 ${segmentId} 未返回音频`)
      return sources
    })()
      .then((sources) => {
        if (generation === generationRef.current && isCurrentMessageGeneration(messageId, messageGeneration)) {
          setClips((current) => ({
            ...current,
            [segmentId]: { status: "ready", source: sources[0], sources },
          }))
        }
        return sources
      })
      .catch((error) => {
        if (isSpeechTaskCancelled(error)) return null
        const message = error instanceof Error ? error.message : String(error)
        if (generation === generationRef.current && isCurrentMessageGeneration(messageId, messageGeneration)) {
          setClips((current) => ({ ...current, [segmentId]: { status: "error", error: message } }))
        }
        console.warn("[Chat][TTS] 合成失败", error)
        return null
      })

    if (!autoPlay) return synthesis
    playbackQueueRef.current.enqueue({
      id: `${segmentId}:complete:${generation}:${messageGeneration}`,
      order: [Number.MAX_SAFE_INTEGER, 0],
      scope: messageId,
      run: async (signal) => {
        const sources = await synthesis
        if (
          !sources ||
          generation !== generationRef.current ||
          playbackGeneration !== playbackGenerationRef.current ||
          !isCurrentMessageGeneration(messageId, messageGeneration)
        ) return
        await playSources(segmentId, sources, generation, playbackGeneration, "auto", segmentId, 0, false, signal)
      },
    })
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
    const messageGeneration = state.messageGeneration
    const playbackGeneration = playbackGenerationRef.current
    state.pending += 1
    updateStreamingClip(state)
    diagnose("synthesis-queued", {
      messageId,
      segmentId: state.segmentId,
      streamKey: state.streamKey,
      persistenceGroupId: state.persistenceGroupId,
      chunkIndex,
      playbackOrder: state.playbackOrder,
      textLength: text.length,
    })

    const request = synthesisSchedulerRef.current.schedule(messageId, async (signal) => {
        if (!await authorizeAutomaticSpeechSynthesis(surface)) {
          diagnose("synthesis-skipped", {
            reason: "not-preferred-surface",
            messageId,
            segmentId: state.segmentId,
            streamKey: state.streamKey,
            chunkIndex,
          })
          return null
        }
        let lastError: unknown
        for (const delayMs of [0, 150, 400, 900]) {
          await waitForSpeechRetry(delayMs, signal)
          try {
            throwIfSpeechTaskCancelled(signal)
            const result = await synthesizeSpeechSegment({
              sessionId,
              messageId,
              segmentGroupId: state.persistenceGroupId,
              groupIndex: state.groupIndex,
              sequence: chunkIndex,
              text,
              configId,
              mode,
            })
            throwIfSpeechTaskCancelled(signal)
            if (!result.success) throw new Error(result.error_message || `语音句子 ${chunkIndex + 1} 合成失败`)
            diagnose("synthesis-completed", {
              messageId,
              segmentId: state.segmentId,
              streamKey: state.streamKey,
              chunkIndex,
              audioBlobId: result.audio_blob_id ?? null,
              durationMs: result.duration_ms ?? null,
            })
            return result
          } catch (error) {
            if (signal.aborted || isSpeechTaskCancelled(error)) throw error
            lastError = error
          }
        }
        throw lastError instanceof Error ? lastError : new Error(`语音句子 ${chunkIndex + 1} 合成失败`)
      })
    const synthesis = request
      .then(async (result) => {
        if (!result) return null
        if (!result.audio_blob_id) throw new Error(`语音句子 ${chunkIndex + 1} 未返回音频`)
        const source = await resolveVoiceBlobUrl(result.audio_blob_id)
        if (
          generation === generationRef.current &&
          isCurrentMessageGeneration(messageId, messageGeneration)
        ) state.sources.set(chunkIndex, source)
        return source
      })
      .catch((error) => {
        if (isSpeechTaskCancelled(error)) return null
        const message = error instanceof Error ? error.message : String(error)
        if (
          generation === generationRef.current &&
          isCurrentMessageGeneration(messageId, messageGeneration)
        ) state.error = message
        diagnose("synthesis-failed", {
          messageId,
          segmentId: state.segmentId,
          streamKey: state.streamKey,
          chunkIndex,
          error: message,
        })
        console.warn("[Chat][TTS] 流式句子合成失败", error)
        return null
      })
      .finally(() => {
        if (
          generation !== generationRef.current ||
          !isCurrentMessageGeneration(messageId, messageGeneration)
        ) return
        state.pending = Math.max(0, state.pending - 1)
        updateStreamingClip(state)
      })

    if (!automaticPlaybackEnabledRef.current) return
    playbackQueueRef.current.enqueue({
      id: `${state.streamKey}:revision:${messageGeneration}:tts:${chunkIndex}`,
      order: [state.playbackOrder, chunkIndex],
      scope: messageId,
      group: state.streamKey,
      run: async (signal) => {
        const source = await synthesis
        if (
          !source ||
          generation !== generationRef.current ||
          playbackGeneration !== playbackGenerationRef.current ||
          !isCurrentMessageGeneration(messageId, messageGeneration)
        ) return
        const availableEntries = [...state.sources.entries()]
          .filter(([index]) => index <= chunkIndex)
          .sort(([left], [right]) => left - right)
        const availableSources = availableEntries.map(([, availableSource]) => availableSource)
        const sourceIndex = Math.max(0, availableEntries.findIndex(([index]) => index === chunkIndex))
        await playSources(
          state.segmentId,
          availableSources,
          generation,
          playbackGeneration,
          "auto",
          `${state.streamKey}:tts:${chunkIndex}`,
          sourceIndex,
          true,
          signal,
        )
      },
    })
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

  const getProgress = useCallback((segmentId: string) => {
    const progress = progressRef.current
    return progress?.segmentId === segmentId ? progress : null
  }, [])

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void listenDesktopSpeechPlaybackControl((control) => {
      if (control.type === "stop" && speechLeaseRef.current === control.leaseId) {
        diagnose("playback-control-received", {
          leaseId: control.leaseId,
          reason: control.reason ?? "unknown",
          replacementIntent: control.replacementIntent ?? null,
          replacementSurface: control.replacementSurface ?? null,
        })
        stopPlayback({
          cancelSynthesis: false,
          cancelPlaybackQueue: false,
          clearClips: false,
          // A coordinator handoff interrupts one lease. It is not a user
          // request to silence all later chunks in this response.
          disableAutomaticPlayback: false,
          resetOutputGate: false,
          reason: `desktop-control:${control.reason ?? "unknown"}`,
        })
      }
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
    stop(true, false, "hook-unmounted")
    void updateDesktopActivityFacts({ surface, tts_playing: false })
  }, [])

  useEffect(() => {
    void updateDesktopActivityFacts({
      surface,
      tts_playing: Boolean(activeSegmentId) && !paused,
    })
  }, [activeSegmentId, paused, surface])

  useEffect(() => {
    const context = `${sessionId ?? ""}:${mode}:${surface}`
    if (synthesisContextRef.current === context) return
    synthesisContextRef.current = context
    stop(true, true, "speech-context-changed")
    messageEpochsRef.current = new Map(
      [...activeMessageRevisions].map(([messageId, revision]) => [messageId, revision.epoch]),
    )
    messageGenerationsRef.current.clear()
    automaticPlaybackEnabledRef.current = isThinking
    runActiveRef.current = isThinking
    outputGateRef.current?.reset(isThinking)
  }, [isThinking, mode, sessionId, surface])

  useEffect(() => {
    const previous = messageEpochsRef.current
    const next = new Map<string, number>()
    for (const [messageId, revision] of activeMessageRevisions) {
      next.set(messageId, revision.epoch)
      const previousEpoch = previous.get(messageId)
      if (previousEpoch === undefined || previousEpoch === revision.epoch) continue
      invalidateMessageSpeech(
        messageId,
        revision.reason || "agent.stream_reset",
        previousEpoch,
        revision.epoch,
      )
    }
    messageEpochsRef.current = next
  }, [activeMessageRevisionSignature])

  useEffect(() => {
    if (!sessionId || mode === "none" || isThinking) return
    const generation = generationRef.current
    const restorationMessageGenerations = new Map(
      segments.map((segment) => [segment.messageId, currentMessageGeneration(segment.messageId)]),
    )
    void listMessageSpeechSegments(sessionId).then(async (persisted) => {
      const messageGroupIndexes = new Map<string, number>()
      for (const segment of segments) {
        const groupIndex = messageGroupIndexes.get(segment.messageId) ?? 0
        messageGroupIndexes.set(segment.messageId, groupIndex + 1)
        const persistenceGroupId = speechStreamKey(segment.messageId, groupIndex, segment.streamEpoch)
        const chunks = speechChunksForTTS(segment.text, mode)
        const messageSegments = persisted.filter((item) => item.external_message_id === segment.messageId)
        const currentSegments = messageSegments.filter((item) => item.segment_group_id === persistenceGroupId)
        const saved = (currentSegments.length
          ? currentSegments
          : messageSegments.filter((item) => item.segment_group_id === segment.id))
          .sort((left, right) => left.sequence - right.sequence)
        if (!chunks.length || saved.length !== chunks.length) continue
        const hashes = await Promise.all(chunks.map(speechTextHash))
        if (saved.some((item, index) => item.sequence !== index || item.text_hash !== hashes[index])) continue
        const blobIds = saved.map((item) => item.audio_blob_id).filter((id): id is string => Boolean(id))
        if (blobIds.length !== saved.length) continue
        const sources = await Promise.all(blobIds.map(resolveVoiceBlobUrl))
        const messageGeneration = restorationMessageGenerations.get(segment.messageId) ?? 0
        if (
          sources.length !== saved.length ||
          generation !== generationRef.current ||
          !isCurrentMessageGeneration(segment.messageId, messageGeneration)
        ) continue
        setClips((current) => ({
          ...current,
          [segment.id]: { status: "ready", source: sources[0], sources },
        }))
      }
    }).catch((error) => console.warn("[Chat][TTS] 恢复持久化语音失败", error))
  }, [isThinking, mode, restoreSignature, sessionId])

  useEffect(() => {
    if (mode === "none") {
      stop(true, true, "tts-disabled")
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
    if (isThinking && !runWasActive) {
      automaticPlaybackEnabledRef.current = true
      // Connector/self-awake runs can become active before their new message
      // shell arrives. Completed messages visible at that boundary belong to
      // the previous run and must never be replayed as fresh output.
      // Playback order deliberately remains monotonic while the queue survives:
      // a handoff can start a new root run before the previous speech drains.
      runBaselineMessageIdsRef.current = new Set(
        activeSegments
          .filter((segment) => segment.state !== "streaming")
          .map((segment) => segment.messageId),
      )
    }
    if (isThinking) {
      runActiveRef.current = true
      outputGateRef.current?.begin()
    }
    if (isThinking || runWasActive) {
      const messageGroupIndexes = new Map<string, number>()
      for (const segment of activeSegments) {
        if (
          runBaselineMessageIdsRef.current.has(segment.messageId) &&
          segment.state !== "streaming"
        ) continue
        const textSegmentIndex = messageGroupIndexes.get(segment.messageId) ?? 0
        messageGroupIndexes.set(segment.messageId, textSegmentIndex + 1)
        if (typeof segment.configId !== "number") continue
        if (!textForTTS(segment.text, mode)) continue
        const streamKey = speechStreamKey(segment.messageId, textSegmentIndex, segment.streamEpoch)
        let state = streamStatesRef.current.get(streamKey)
        if (!state) {
          state = {
            messageId: segment.messageId,
            segmentId: segment.id,
            streamKey,
            persistenceGroupId: streamKey,
            messageGeneration: currentMessageGeneration(segment.messageId),
            groupIndex: textSegmentIndex,
            nextChunkIndex: 0,
            pending: 0,
            sources: new Map(),
            complete: false,
            configId: segment.configId,
            playbackOrder: nextStreamOrderRef.current++,
          }
          streamStatesRef.current.set(streamKey, state)
          const reserved = playbackQueueRef.current.reserveGroup(streamKey, [state.playbackOrder])
          diagnose("playback-group-reserved", {
            messageId: state.messageId,
            segmentId: state.segmentId,
            streamKey,
            playbackOrder: state.playbackOrder,
            reserved,
          })
        } else {
          state.segmentId = segment.id
          state.groupIndex = textSegmentIndex
          state.configId = segment.configId
        }
        const flush = segment.state !== "streaming" || (!isThinking && runWasActive)
        let update = consumeSpeechStream(segment.text, mode, state.cursor, flush)
        if (update.resetRequired) {
          // A canonical rewrite crossed an already committed boundary. Cancel
          // only this message's stale pending work. Audio which is already
          // playing is allowed to finish before the corrected revision.
          const playbackOrder = state.playbackOrder
          const messageGeneration = invalidateMessageSpeech(
            segment.messageId,
            "committed-prefix-rewritten",
            segment.streamEpoch ?? 0,
            segment.streamEpoch ?? 0,
          )
          state = {
            messageId: segment.messageId,
            segmentId: segment.id,
            streamKey,
            persistenceGroupId: `${streamKey}:rewrite:${messageGeneration}`,
            messageGeneration,
            groupIndex: textSegmentIndex,
            nextChunkIndex: 0,
            pending: 0,
            sources: new Map(),
            complete: false,
            configId: segment.configId,
            playbackOrder,
          }
          streamStatesRef.current.set(streamKey, state)
          const reserved = playbackQueueRef.current.reserveGroup(streamKey, [state.playbackOrder])
          diagnose("playback-group-replaced", {
            messageId: state.messageId,
            segmentId: state.segmentId,
            streamKey,
            playbackOrder: state.playbackOrder,
            reserved,
            messageGeneration,
          })
          update = consumeSpeechStream(segment.text, mode, undefined, flush)
        }
        state.cursor = update.cursor
        for (const text of update.chunks) {
          const chunkIndex = state.nextChunkIndex
          state.nextChunkIndex += 1
          enqueueStreamingChunk(segment.messageId, text, chunkIndex, state)
        }
        if (flush) {
          state.complete = true
          updateStreamingClip(state)
          const sealed = playbackQueueRef.current.sealGroup(streamKey)
          if (sealed) {
            diagnose("playback-group-sealed", {
              messageId: state.messageId,
              segmentId: state.segmentId,
              streamKey,
              playbackOrder: state.playbackOrder,
              chunkCount: state.nextChunkIndex,
            })
          }
        }
      }
    }
    if (!isThinking && runWasActive) {
      runActiveRef.current = false
      runBaselineMessageIdsRef.current.clear()
      const finalQueue = playbackQueueRef.current.whenIdle()
      const finalGeneration = generationRef.current
      outputGateRef.current?.holdUntil(finalQueue)
      void finalQueue.finally(() => {
        if (generationRef.current !== finalGeneration) return
        const segmentId = progressRef.current?.segmentId
        if (segmentId && !audioRef.current) {
          progressRef.current = null
          setActiveSegmentId((current) => current === segmentId ? null : current)
          setPaused(false)
        }
        streamStatesRef.current.clear()
      })
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
