import { useEffect, useRef } from "react"

import { reportPerformanceDiagnostic } from "../lib/desktop-window"

interface PerformanceDiagnosticsSnapshot {
  messages: number
  segments: number
  streaming: boolean
}

export function usePerformanceDiagnostics(snapshot: PerformanceDiagnosticsSnapshot) {
  const rendersRef = useRef(0)
  const snapshotRef = useRef(snapshot)
  rendersRef.current += 1
  snapshotRef.current = snapshot

  useEffect(() => {
    let longTaskCount = 0
    let longTaskDuration = 0
    let longestTask = 0
    let observer: PerformanceObserver | undefined
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskCount += 1
          longTaskDuration += entry.duration
          longestTask = Math.max(longestTask, entry.duration)
        }
      })
      observer.observe({ type: "longtask", buffered: true })
    } catch {
      observer = undefined
    }

    let previousRenders = rendersRef.current
    let expected = performance.now() + 5_000
    const timer = window.setInterval(() => {
      const now = performance.now()
      const renders = rendersRef.current - previousRenders
      previousRenders = rendersRef.current
      const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number } }).memory
      void reportPerformanceDiagnostic("chat-page", {
        ...snapshotRef.current,
        rendersPer5s: renders,
        eventLoopLagMs: Math.max(0, Math.round(now - expected)),
        longTaskCount,
        longTaskDurationMs: Math.round(longTaskDuration),
        longestTaskMs: Math.round(longestTask),
        domNodes: document.getElementsByTagName("*").length,
        usedHeapMB: memory?.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1_048_576) : null,
        totalHeapMB: memory?.totalJSHeapSize ? Math.round(memory.totalJSHeapSize / 1_048_576) : null,
        hidden: document.hidden,
        focused: document.hasFocus(),
      })
      longTaskCount = 0
      longTaskDuration = 0
      longestTask = 0
      expected = now + 5_000
    }, 5_000)

    return () => {
      observer?.disconnect()
      window.clearInterval(timer)
    }
  }, [])
}
