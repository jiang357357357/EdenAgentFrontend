interface OptimisticUserCandidate {
  id: string
  role: string
  localOnly?: boolean
  createdAt?: number
}

export function findOptimisticUserHandoff<T extends OptimisticUserCandidate>(
  messageOrder: string[],
  messages: Record<string, T>,
  serverCreatedAt: number,
  thresholdMs = 30_000,
): T | undefined {
  return [...messageOrder]
    .reverse()
    .map((messageID) => messages[messageID])
    .find((candidate) =>
      Boolean(
        candidate?.role === "user" &&
          candidate.localOnly &&
          candidate.createdAt &&
          Math.abs(serverCreatedAt - candidate.createdAt) < thresholdMs,
      ),
    )
}
