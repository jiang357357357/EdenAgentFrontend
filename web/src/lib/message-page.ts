export interface NormalizedMessagePage<T> {
  items: T[]
  hasMore: boolean
  nextCursor: string | null
}

export function parseMessagePage<T>(payload: unknown): NormalizedMessagePage<T> {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("Invalid message page: expected an object")
  }

  const page = payload as Record<string, unknown>
  if (!Array.isArray(page.items)) {
    throw new TypeError("Invalid message page: items must be an array")
  }
  if (typeof page.hasMore !== "boolean") {
    throw new TypeError("Invalid message page: hasMore must be a boolean")
  }

  const rawNextCursor = page.nextCursor
  if (rawNextCursor !== null && typeof rawNextCursor !== "string") {
    throw new TypeError("Invalid message page: nextCursor must be a string or null")
  }
  const nextCursor = typeof rawNextCursor === "string" && rawNextCursor ? rawNextCursor : null
  if (page.hasMore && !nextCursor) {
    throw new TypeError("Invalid message page: nextCursor is required when hasMore is true")
  }

  return {
    items: page.items as T[],
    hasMore: page.hasMore,
    nextCursor,
  }
}
