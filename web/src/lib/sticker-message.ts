import type { ApiMessage } from "./agent-client"
import type { SessionEventInput } from "./session-event"

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Sent stickers own durable messages, independent of stream shells, page boundaries and other actors. */
export function stickerMessage(event: SessionEventInput): ApiMessage | undefined {
  if (event.eventType !== "character.sticker.sent") return
  const payload = object(event.payload), part = object(payload.part ?? payload.sticker)
  const stickerID = Number(part.stickerID ?? part.stickerId ?? part.id)
  const characterID = Number(part.characterID ?? part.characterId ?? part.character)
  const url = part.url ?? part.imageUrl ?? part.image_url, name = part.name
  if (!Number.isFinite(stickerID) || !Number.isFinite(characterID) || typeof url !== "string" || !url
    || typeof name !== "string" || !name) return
  const id = event.id, created = Number(event.createdAt), actor = object(payload.actor), speaker = object(payload.speaker)
  const assistantID = speaker.assistantID ?? actor.assistantID
  const identity = typeof assistantID === "string" || typeof assistantID === "number"
    ? { speaker: { assistantID, assistantName: typeof speaker.assistantName === "string" ? speaker.assistantName : "", characterID } } : {}
  const alt = part.alt ?? part.description
  return {
    info: { id, role: "assistant", modelID: "", providerID: "", ...identity,
      ...(event.turnId ? { turnID: String(event.turnId) } : {}), time: { created, completed: created } },
    parts: [{ id: `${id}-sticker`, messageID: id, sessionID: event.sessionId, type: "sticker", stickerID, characterID, name, url,
      ...(typeof part.mime === "string" ? { mime: part.mime } : {}), ...(typeof alt === "string" ? { alt } : {}) }],
  }
}
