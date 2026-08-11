export interface RealtimeSTTFinalization {
  authoritative: boolean
  settle: boolean
  text: string
}

export function realtimeSTTFinalization(
  payload: Record<string, unknown>,
  latestTranscript: string,
): RealtimeSTTFinalization {
  if (payload.type === "final_result") {
    const text = typeof payload.final_text === "string" ? payload.final_text.trim() : ""
    return { authoritative: Boolean(text), settle: true, text: text || latestTranscript }
  }

  if (payload.type === "commit_hint") {
    const text = typeof payload.final_text === "string" ? payload.final_text.trim() : ""
    return { authoritative: Boolean(text), settle: true, text: text || latestTranscript }
  }

  if (payload.type === "status" && typeof payload.final_text === "string") {
    const text = payload.final_text.trim()
    return { authoritative: Boolean(text), settle: true, text: text || latestTranscript }
  }

  if (payload.type === "status" && payload.status === "stopped") {
    return { authoritative: false, settle: true, text: latestTranscript }
  }

  return { authoritative: false, settle: false, text: latestTranscript }
}
