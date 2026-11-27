import { useCallback, useEffect, useRef, useState } from "react"

type Status = "loading" | "playing" | "paused" | "error"
type PlaybackState = { key: string; status: Status; detail?: string } | null
export interface VoiceClip { url: string; duration: number }
export interface VoiceProgress { position: number; duration: number }
export interface VoiceMessage {
  key: string
  messageId: string
  clips: VoiceClip[]
}
interface Playback extends VoiceMessage {
  audio: HTMLAudioElement
  controller: AbortController
  index: number
  offset: number
  revision: number
  url?: string
  onComplete?: () => void
}

export function voiceDuration(clips: VoiceClip[]) {
  return clips.every(clip => clip.duration > 0) ? clips.reduce((total, clip) => total + clip.duration, 0) : 0
}

async function clipAudio(src: string, signal: AbortSignal) {
  const response = await fetch(src, { signal })
  if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) {
    throw new Error("Audio is unavailable")
  }
  return response.blob()
}

export function useTranscriptAudio(suspended = false) {
  const [state, setState] = useState<PlaybackState>(null)
  const active = useRef<Playback | null>(null)
  const release = useCallback(() => {
    const playback = active.current
    if (!playback) return
    active.current = null
    playback.controller.abort()
    playback.audio.onended = null
    playback.audio.onerror = null
    playback.audio.onloadedmetadata = null
    playback.audio.pause()
    playback.audio.removeAttribute("src")
    playback.audio.load()
    if (playback.url) URL.revokeObjectURL(playback.url)
  }, [])

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return
      release()
      setState(null)
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      release()
    }
  }, [release])

  useEffect(() => {
    if (suspended) { release(); setState(null) }
  }, [release, suspended])

  function fail(playback: Playback, detail: string) {
    if (active.current !== playback) return
    release()
    setState({ key: playback.key, status: "error", detail })
  }

  async function resume(playback: Playback) {
    try {
      await playback.audio.play()
      if (active.current === playback && !playback.audio.paused) setState({ key: playback.key, status: "playing" })
      return active.current === playback
    } catch (error) {
      fail(playback, error instanceof DOMException && error.name === "NotAllowedError"
        ? "自动播放被系统拦截，请点一下播放" : "手机无法开始播放这段语音")
      return false
    }
  }

  async function playClip(playback: Playback, index: number, offset = 0, autoplay = true, prefetched?: Promise<Blob | null>) {
    if (active.current !== playback) return
    if (index >= playback.clips.length) {
      release()
      setState(null)
      playback.onComplete?.()
      return
    }
    const revision = ++playback.revision
    playback.index = index
    playback.offset = offset
    playback.audio.onended = null
    playback.audio.onloadedmetadata = null
    playback.audio.pause()
    setState({ key: playback.key, status: "loading" })
    const signal = playback.controller.signal
    try {
      const blob = await (prefetched ?? clipAudio(playback.clips[index].url, signal))
      if (active.current !== playback || playback.revision !== revision) return
      if (!blob) {
        fail(playback, "暂时无法读取这段回复音频")
        return
      }
      if (playback.url) URL.revokeObjectURL(playback.url)
      playback.url = URL.createObjectURL(blob)
      const next = index + 1 < playback.clips.length
        ? clipAudio(playback.clips[index + 1].url, signal).catch(() => null)
        : undefined
      playback.audio.onended = () => void playClip(playback, index + 1, 0, true, next)
      playback.audio.onerror = () => fail(playback, "手机无法解码这段回复音频")
      playback.audio.onloadedmetadata = () => {
        const duration = playback.audio.duration
        if (Number.isFinite(duration) && duration > 0) {
          playback.clips[index].duration = duration
          if (offset > 0) playback.audio.currentTime = Math.min(offset, Math.max(0, duration - .01))
        }
        if (!autoplay) setState({ key: playback.key, status: "paused" })
      }
      playback.audio.src = playback.url
      if (autoplay) await resume(playback)
    } catch {
      if (playback.revision === revision) fail(playback, "暂时无法读取这段回复音频")
    }
  }

  function toggle(key: string, messageId: string, clips: VoiceClip[]) {
    if (suspended) return
    const playback = active.current
    if (playback?.key === key && state?.key === key && state.status !== "loading") {
      if (playback.audio.paused) void resume(playback)
      else {
        playback.audio.pause()
        setState({ key, status: "paused" })
      }
      return
    }
    release()
    if (playback?.key === key) {
      setState(null)
      return
    }
    start({ key, messageId, clips })
  }

  function start(message: VoiceMessage, onComplete?: () => void) {
    const next = { ...message, clips: message.clips.map(clip => ({ ...clip })), audio: new Audio(),
      controller: new AbortController(), index: 0, offset: 0, revision: 0, ...(onComplete ? { onComplete } : {}) }
    active.current = next
    void playClip(next, 0)
  }

  function playSequence(messages: VoiceMessage[]) {
    if (suspended || document.hidden || active.current) return
    function playNext(index: number) {
      const message = messages[index]
      if (message && !document.hidden) start(message, () => playNext(index + 1))
    }
    playNext(0)
  }

  const stopSequence = useCallback(() => {
    if (!active.current?.onComplete) return
    release()
    setState(null)
  }, [release])

  const getProgress = useCallback((key: string): VoiceProgress | null => {
    const playback = active.current
    if (playback?.key !== key) return null
    const elapsed = playback.clips.slice(0, playback.index).reduce((total, clip) => total + clip.duration, 0)
    const offset = playback.audio.readyState > 0 ? playback.audio.currentTime : playback.offset
    return { position: elapsed + offset, duration: voiceDuration(playback.clips) }
  }, [])

  function seek(key: string, position: number) {
    const playback = active.current
    if (playback?.key !== key || state?.status === "loading") return
    const duration = voiceDuration(playback.clips)
    if (duration <= 0 || !Number.isFinite(position)) return
    let offset = Math.max(0, Math.min(position, duration - .01))
    let index = 0
    while (index < playback.clips.length - 1 && offset >= playback.clips[index].duration) {
      offset -= playback.clips[index].duration
      index++
    }
    if (index === playback.index) playback.audio.currentTime = offset
    else void playClip(playback, index, offset, !playback.audio.paused)
  }

  const discardRemoved = useCallback((messageIds: ReadonlySet<string>) => {
    const playback = active.current
    if (!playback || messageIds.has(playback.messageId)) return
    release()
    setState(null)
  }, [release])

  return { state, toggle, playSequence, stopSequence, getProgress, seek, discardRemoved, suspended }
}
