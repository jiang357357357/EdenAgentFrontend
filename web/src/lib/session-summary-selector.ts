import type { RuntimeSession, RuntimeState, Session } from "../types"
import { formatLocalTime } from "./time"

const EMPTY_MESSAGES: Session["messages"] = []

function summaryMatches(summary: Session, source: RuntimeSession): boolean {
  return summary.title === (source.title || "新会话") && summary.updatedAt === source.updatedAt
    && summary.participants === source.participants && summary.avatarUrl === source.sidebarAvatarUrl
    && summary.mode === source.mode
}

/** List rows never retain message views or invalidate for an ordinary text delta. */
export function createSessionSummarySelector() {
  let previous: Session[] = []
  return (state: RuntimeState): Session[] => {
    const indexed = new Map(previous.map(item => [item.id, item]))
    const next = state.sessionOrder.flatMap(id => {
      const source = state.sessions[id]
      if (!source) return []
      const cached = indexed.get(id)
      if (cached && summaryMatches(cached, source)) return [cached]
      return [{ id, title: source.title || "新会话", updatedAt: source.updatedAt, date: formatLocalTime(source.updatedAt),
        participants: source.participants, mode: source.mode, avatarUrl: source.sidebarAvatarUrl, messages: EMPTY_MESSAGES }]
    })
    if (next.length === previous.length && next.every((item, index) => item === previous[index])) return previous
    previous = next
    return next
  }
}
