import type { ApiEvent } from './agent-client'

/** Keep background execution out of chat state while retaining approval notifications. */
export function filterChatEvents(isBackground: (id: string) => Promise<boolean>, emit: (event: ApiEvent) => void) {
  const visibility = new Map<string, Promise<boolean>>()
  return (event: ApiEvent) => {
    const id = (event.properties as { sessionID?: string }).sessionID
    if (!id || !/^(session|message|companion|subagent)\./.test(event.type)) {
      emit(event)
      return
    }
    let hidden = visibility.get(id)
    if (!hidden) {
      hidden = isBackground(id).catch(() => { visibility.delete(id); return false })
      visibility.set(id, hidden)
    }
    // Reactions on the same promise preserve event order, including completion.
    void hidden.then(background => { if (!background) emit(event) })
  }
}
