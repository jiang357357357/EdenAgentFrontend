export function formatReplyDuration(durationMs?: number): string | undefined {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return undefined
  if (durationMs < 1_000) return "不到 1 秒"

  const seconds = Math.round(durationMs / 100) / 10
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`

  const wholeSeconds = Math.round(seconds)
  const hours = Math.floor(wholeSeconds / 3_600)
  const minutes = Math.floor((wholeSeconds % 3_600) / 60)
  const remainingSeconds = wholeSeconds % 60
  return hours > 0
    ? `${hours} 小时 ${minutes} 分 ${remainingSeconds} 秒`
    : `${minutes} 分 ${remainingSeconds} 秒`
}
