import type { Session } from "../types"

export type SessionListRow = { key: string; offset: number; height: number } & (
  { label: string; session?: never; position?: never }
  | { session: Session; position: number; label?: never }
)

export function sessionListLayout(sessions: Session[], viewportHeight: number, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const groups = new Map<string, Session[]>()
  for (const session of sessions) {
    const updated = session.updatedAt ?? 0
    const label = updated >= today ? "今天" : updated >= today - 86_400_000 ? "昨天"
      : updated >= today - 6 * 86_400_000 ? "本周" : "更早"
    const group = groups.get(label) ?? []
    group.push(session)
    groups.set(label, group)
  }
  const height = Math.max(52, Math.round(viewportHeight * 0.075))
  const rows: SessionListRow[] = []
  let offset = 0, position = 0
  for (const label of ["今天", "昨天", "本周", "更早"]) {
    const group = groups.get(label)
    if (!group) continue
    rows.push({ key: `group:${label}`, label, offset, height: 36 })
    offset += 36
    for (const session of group) {
      rows.push({ key: session.id, session, offset, height, position: ++position })
      offset += height
    }
  }
  return { rows, height: offset }
}

export function visibleSessionRows(rows: SessionListRow[], top: number, height: number, overscan = 5) {
  let low = 0, high = rows.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (rows[middle].offset + rows[middle].height <= top) low = middle + 1
    else high = middle
  }
  const start = Math.max(0, low - overscan)
  let end = low
  while (end < rows.length && rows[end].offset < top + height) end++
  return rows.slice(start, Math.min(rows.length, end + overscan))
}
