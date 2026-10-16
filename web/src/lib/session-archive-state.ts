import type { ApiEvent } from "./agent-client"

type ArchiveState = { archived?: boolean; archiveUpdatedAt?: number }

/** Late list snapshots and replayed events cannot undo a newer archive decision. */
export function sessionArchiveState(current: ArchiveState | undefined, archived: boolean | undefined, updatedAt: number) {
  if (archived === undefined || updatedAt < (current?.archiveUpdatedAt ?? 0))
    return { archived: current?.archived ?? false, archiveUpdatedAt: current?.archiveUpdatedAt ?? 0 }
  return { archived, archiveUpdatedAt: updatedAt }
}

export function sessionArchiveEvent(event: ApiEvent) {
  if (event.type !== "session.archive_updated") return undefined
  const value = event.properties as Record<string, unknown>
  if (!value || typeof value.sessionID !== "string" || typeof value.archived !== "boolean"
    || typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt) || value.updatedAt < 0) return undefined
  return { sessionID: value.sessionID, archived: value.archived, updatedAt: value.updatedAt }
}
