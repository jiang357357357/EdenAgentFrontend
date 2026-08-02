import { useEffect, useRef, useState } from "react"

import { resolveCoreAssetUrl } from "../../../../lib/auth"
import {
  claimDesktopSpeechPlayback,
  listenDesktopSpeechPlaybackControl,
  releaseDesktopSpeechPlayback,
  updateDesktopActivityFacts,
  type DesktopSpeechIntent,
  type PetTTSMode,
} from "../../../../lib/desktop-window"
import { synthesizeSpeechSegment } from "../../../../lib/mon_agent_api"
import { SpeechOutputGate } from "../../../../lib/speech-output-gate"
import {
  consumeSpeechStream,
  speechChunksForTTS,
  speechStreamKey,
  textForTTS,
  type SpeechStreamCursor,
} from "../../../../lib/tts-text"
import type { MessageData } from "../../../../types"

export interface SpeechClip {
  status: "synthesizing" | "ready" | "error"
  source?: string
  sources?: string[]
  error?: string
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

interface PetSpeechPlaybackOptions {
  isThinking: boolean
  latestAssistantMessage?: MessageData
  sessionId?: string
  ttsConfigId?: number | null
  ttsMode: PetTTSMode
}

export function usePetSpeechPlayback({ isThinking, latestAssistantMessage, sessionId, ttsConfigId, ttsMode }: PetSpeechPlaybackOptions) {
  const [speechOutputPending, setSpeechOutputPending] = useState(isThinking)
  const [speechClips, setSpeechClips] = useState<Record<string, SpeechClip>>({})
  const [activeSpeechSegmentId, setActiveSpeechSegmentId] = useState<string | null>(null)
  const [speechPaused, setSpeechPaused] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioSegmentIdRef = useRef<string | null>(null)
  const finishAudioRef = useRef<(() => void) | null>(null)
  const playbackGenerationRef = useRef(0)
  const speechGenerationRef = useRef(0)
  const speechSynthesisQueueRef = useRef<Promise<void>>(Promise.resolve())
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve())
  const speechRunActiveRef = useRef(isThinking)
  const streamSpeechStatesRef = useRef<Map<string, StreamingSpeechState>>(new Map())
  const speechLeaseRef = useRef<string | null>(null)
  const speechContextRef = useRef(`${sessionId ?? ""}:${ttsMode}`)
  const speechOutputGateRef = useRef<SpeechOutputGate | null>(null)
  if (!speechOutputGateRef.current) {
    speechOutputGateRef.current = new SpeechOutputGate(isThinking, setSpeechOutputPending)
  }

  const stopSpeechPlayback = (cancelSynthesis = false, clearClips = false) => {
    speechOutputGateRef.current?.reset(false)
    playbackGenerationRef.current += 1
    if (cancelSynthesis) {
      speechGenerationRef.current += 1
      streamSpeechStatesRef.current.clear()
    }
    audioRef.current?.pause()
    audioRef.current = null
    audioSegmentIdRef.current = null
    finishAudioRef.current?.()
    finishAudioRef.current = null
    const leaseId = speechLeaseRef.current
    speechLeaseRef.current = null
    void releaseDesktopSpeechPlayback(leaseId)
    speechSynthesisQueueRef.current = Promise.resolve()
    speechQueueRef.current = Promise.resolve()
    setActiveSpeechSegmentId(null)
    setSpeechPaused(false)
    if (clearClips) setSpeechClips({})
  }

  const playSpeechAudioSource = (segmentID: string, source: string, generation: number) => {
    return new Promise<void>((resolve, reject) => {
      if (generation !== speechGenerationRef.current) {
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
        if (audioSegmentIdRef.current === segmentID) audioSegmentIdRef.current = null
        setSpeechPaused(false)
        if (error) reject(error)
        else resolve()
      }
      audioRef.current = audio
      audioSegmentIdRef.current = segmentID
      finishAudioRef.current = () => finish()
      audio.addEventListener("ended", () => finish(), { once: true })
      audio.addEventListener("error", () => finish(new Error(`语音段 ${segmentID} 播放失败`)), { once: true })
      void audio.play().catch((error) => finish(error))
    })
  }

  const playSpeechSources = async (
    segmentID: string,
    sources: string[],
    generation: number,
    playbackGeneration: number,
    intent: DesktopSpeechIntent,
    speechKey = segmentID,
  ) => {
    if (generation !== speechGenerationRef.current || playbackGeneration !== playbackGenerationRef.current) return
    const claim = await claimDesktopSpeechPlayback("pet-bubble", speechKey, intent)
    if (!claim.granted || !claim.leaseId) return
    if (generation !== speechGenerationRef.current || playbackGeneration !== playbackGenerationRef.current) {
      void releaseDesktopSpeechPlayback(claim.leaseId)
      return
    }
    speechLeaseRef.current = claim.leaseId
    setActiveSpeechSegmentId(segmentID)
    setSpeechPaused(false)
    try {
      for (const source of sources) {
        if (generation !== speechGenerationRef.current || playbackGeneration !== playbackGenerationRef.current) return
        await playSpeechAudioSource(segmentID, source, generation)
      }
    } finally {
      if (speechLeaseRef.current === claim.leaseId) speechLeaseRef.current = null
      void releaseDesktopSpeechPlayback(claim.leaseId)
      setActiveSpeechSegmentId((current) => current === segmentID ? null : current)
      setSpeechPaused(false)
    }
  }

  const enqueueSpeechSegment = (
    segmentID: string,
    messageID: string,
    rawText: string,
    intent: DesktopSpeechIntent = "auto",
  ) => {
    if (!sessionId || !messageID || typeof ttsConfigId !== "number" || ttsMode === "none") {
      console.warn("[DesktopPet][TTS] 当前角色未关联可用的 TTS 配置")
      return
    }
    const chunks = speechChunksForTTS(rawText, ttsMode)
    if (!chunks.length) return

    const generation = speechGenerationRef.current
    const playbackGeneration = playbackGenerationRef.current
    setSpeechClips((current) => ({ ...current, [segmentID]: { status: "synthesizing" } }))
    const synthesis = (async () => {
      const sources: string[] = []
      for (const [index, text] of chunks.entries()) {
        const requestSegmentID = chunks.length === 1 ? segmentID : `${segmentID}:tts:${index}`
        const result = await synthesizeSpeechSegment({
          sessionId,
          messageId: messageID,
          segmentId: requestSegmentID,
          text,
          configId: ttsConfigId,
          mode: ttsMode,
        })
        if (!result.success) throw new Error(result.error_message || `语音段 ${index + 1}/${chunks.length} 合成失败`)
        const source = result.audio_data
          ? `data:audio/wav;base64,${result.audio_data}`
          : resolveCoreAssetUrl(result.audio_url)
        if (!source) throw new Error(`语音段 ${index + 1}/${chunks.length} 未返回音频`)
        sources.push(source)
      }
      if (!sources.length) throw new Error(`语音段 ${segmentID} 未返回音频`)
      return sources
    })()
      .then((sources) => {
        if (generation === speechGenerationRef.current) {
          setSpeechClips((current) => ({
            ...current,
            [segmentID]: { status: "ready", source: sources[0], sources },
          }))
        }
        return { sources, error: null }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        if (generation === speechGenerationRef.current) {
          setSpeechClips((current) => ({ ...current, [segmentID]: { status: "error", error: message } }))
        }
        return { sources: null, error }
      })
    const previous = speechQueueRef.current.catch(() => undefined)
    speechQueueRef.current = previous
      .then(async () => {
        const outcome = await synthesis
        if (generation !== speechGenerationRef.current) return
        if (playbackGeneration !== playbackGenerationRef.current) return
        if (outcome.error) throw outcome.error
        if (!outcome.sources) throw new Error(`语音段 ${segmentID} 未返回音频`)
        await playSpeechSources(segmentID, outcome.sources, generation, playbackGeneration, intent)
      })
      .catch((error) => {
        console.warn("[DesktopPet][TTS] 分段合成或播放失败", error)
      })
  }

  const updateStreamingSpeechClip = (state: StreamingSpeechState) => {
    const segmentID = state.segmentId
    const sources = [...state.sources.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, source]) => source)
    const settled = state.complete && state.pending === 0
    setSpeechClips((current) => ({
      ...current,
      [segmentID]: state.error && settled
        ? { status: "error", source: sources[0], sources, error: state.error }
        : settled
          ? { status: "ready", source: sources[0], sources }
          : { status: "synthesizing", source: sources[0], sources },
    }))
  }

  const enqueueStreamingSpeechChunk = (
    messageID: string,
    text: string,
    chunkIndex: number,
    state: StreamingSpeechState,
  ) => {
    if (!sessionId || !messageID || typeof ttsConfigId !== "number" || ttsMode === "none") return
    const generation = speechGenerationRef.current
    const playbackGeneration = playbackGenerationRef.current
    state.pending += 1
    updateStreamingSpeechClip(state)

    const request = speechSynthesisQueueRef.current
      .catch(() => undefined)
      .then(() => synthesizeSpeechSegment({
        sessionId,
        messageId: messageID,
        segmentId: `${state.streamKey}:tts:${chunkIndex}`,
        text,
        configId: ttsConfigId,
        mode: ttsMode,
      }))
    speechSynthesisQueueRef.current = request.then(() => undefined, () => undefined)
    const synthesis = request
      .then((result) => {
        if (!result.success) throw new Error(result.error_message || `语音句子 ${chunkIndex + 1} 合成失败`)
        const source = result.audio_data
          ? `data:audio/wav;base64,${result.audio_data}`
          : resolveCoreAssetUrl(result.audio_url)
        if (!source) throw new Error(`语音句子 ${chunkIndex + 1} 未返回音频`)
        if (generation === speechGenerationRef.current) state.sources.set(chunkIndex, source)
        return source
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        if (generation === speechGenerationRef.current) state.error = message
        console.warn("[DesktopPet][TTS] 流式句子合成失败", error)
        return null
      })
      .finally(() => {
        if (generation !== speechGenerationRef.current) return
        state.pending = Math.max(0, state.pending - 1)
        updateStreamingSpeechClip(state)
      })

    speechQueueRef.current = speechQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const source = await synthesis
        if (!source || generation !== speechGenerationRef.current || playbackGeneration !== playbackGenerationRef.current) return
        await playSpeechSources(
          state.segmentId,
          [source],
          generation,
          playbackGeneration,
          "auto",
          `${state.streamKey}:tts:${chunkIndex}`,
        )
      })
      .catch((error) => console.warn("[DesktopPet][TTS] 流式句子播放失败", error))
  }

  const toggleSpeechClip = (segmentID: string, messageID: string, rawText: string) => {
    const clip = speechClips[segmentID]
    const sources = clip?.sources ?? (clip?.source ? [clip.source] : [])
    if (clip?.status === "synthesizing") return
    if (clip?.status !== "ready" || !sources.length) {
      enqueueSpeechSegment(segmentID, messageID, rawText, "manual")
      return
    }

    if (audioSegmentIdRef.current === segmentID && audioRef.current) {
      if (audioRef.current.paused) {
        setSpeechPaused(false)
        void audioRef.current.play().catch((error) => {
          console.warn("[DesktopPet][TTS] 恢复播放失败", error)
          finishAudioRef.current?.()
        })
      } else {
        audioRef.current.pause()
        setSpeechPaused(true)
      }
      return
    }

    stopSpeechPlayback(false)
    const generation = speechGenerationRef.current
    speechQueueRef.current = playSpeechSources(
      segmentID,
      sources,
      generation,
      playbackGenerationRef.current,
      "manual",
    ).catch((error) => {
      console.warn("[DesktopPet][TTS] 手动播放失败", error)
    })
  }


  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void listenDesktopSpeechPlaybackControl((control) => {
      if (control.type === "stop" && speechLeaseRef.current === control.leaseId) stopSpeechPlayback(false)
    }).then((listener) => {
      if (disposed) listener?.()
      else unsubscribe = listener
    })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    void updateDesktopActivityFacts({
      surface: "pet-bubble",
      tts_playing: Boolean(activeSpeechSegmentId) && !speechPaused,
    })
  }, [activeSpeechSegmentId, speechPaused])

  useEffect(() => {
    const context = `${sessionId ?? ""}:${ttsMode}`
    if (speechContextRef.current === context) return
    speechContextRef.current = context
    stopSpeechPlayback(true, true)
    speechRunActiveRef.current = isThinking
    speechOutputGateRef.current?.reset(isThinking)
  }, [isThinking, sessionId, ttsMode])

  useEffect(() => {
    if (ttsMode === "none") {
      stopSpeechPlayback(true, true)
      speechRunActiveRef.current = isThinking
      speechOutputGateRef.current?.reset(isThinking)
      return
    }
    if (!sessionId || typeof ttsConfigId !== "number") {
      speechRunActiveRef.current = isThinking
      speechOutputGateRef.current?.reset(isThinking)
      return
    }
    const runWasActive = speechRunActiveRef.current
    if (isThinking) {
      speechRunActiveRef.current = true
      speechOutputGateRef.current?.begin()
    }
    const maySpeakCurrentRun = isThinking || runWasActive
    if (maySpeakCurrentRun) {
      let textSegmentIndex = 0
      for (const segment of latestAssistantMessage?.segments ?? []) {
        if (segment.type !== "text") continue
        const streamKey = speechStreamKey(latestAssistantMessage?.id ?? "", textSegmentIndex)
        textSegmentIndex += 1
        if (!segment.content.trim() || !textForTTS(segment.content, ttsMode)) continue
        let state = streamSpeechStatesRef.current.get(streamKey)
        if (!state) {
          state = {
            segmentId: segment.id,
            streamKey,
            nextChunkIndex: 0,
            pending: 0,
            sources: new Map(),
            complete: false,
          }
          streamSpeechStatesRef.current.set(streamKey, state)
        } else {
          state.segmentId = segment.id
        }
        const flush = segment.state !== "streaming" || (!isThinking && runWasActive)
        const update = consumeSpeechStream(segment.content, ttsMode, state.cursor, flush)
        state.cursor = update.cursor
        for (const text of update.chunks) {
          const chunkIndex = state.nextChunkIndex
          state.nextChunkIndex += 1
          enqueueStreamingSpeechChunk(latestAssistantMessage.id, text, chunkIndex, state)
        }
        if (flush) {
          state.complete = true
          updateStreamingSpeechClip(state)
        }
      }
    }
    if (!isThinking && runWasActive) {
      speechRunActiveRef.current = false
      speechOutputGateRef.current?.holdUntil(speechQueueRef.current)
    }
  }, [isThinking, latestAssistantMessage, sessionId, ttsConfigId, ttsMode])

  useEffect(() => () => {
    stopSpeechPlayback(true)
    void updateDesktopActivityFacts({ surface: "pet-bubble", tts_playing: false })
  }, [])

  return {
    activeSpeechSegmentId,
    speechClips,
    speechOutputActive: speechOutputPending || Boolean(activeSpeechSegmentId),
    speechPaused,
    stopSpeechPlayback,
    toggleSpeechClip,
  }
}
