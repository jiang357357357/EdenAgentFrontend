interface OptimisticUserCandidate {
  id: string
  turnID?: string
  role: string
  localOnly?: boolean
  deliveryState?: "sending" | "queued" | "failed"
  createdAt?: number
}

export function findOptimisticUserHandoff<T extends OptimisticUserCandidate>(
  messageOrder: string[],
  messages: Record<string, T>,
  serverCreatedAt: number,
  serverTurnID?: string,
  thresholdMs = 30_000,
): T | undefined {
  const candidates = messageOrder
    .map((messageID) => messages[messageID])
    .filter((candidate): candidate is T =>
      Boolean(
        candidate?.role === "user" &&
          candidate.localOnly &&
          candidate.deliveryState !== "failed",
      ),
    )
  if (serverTurnID) {
    const exact = candidates.find((candidate) => candidate.turnID === serverTurnID)
    if (exact) return exact
  }
  return candidates.find((candidate) =>
    Boolean(
      (!serverTurnID || !candidate.turnID) &&
      candidate.createdAt &&
        Math.abs(serverCreatedAt - candidate.createdAt) < thresholdMs,
    ),
  )
}
