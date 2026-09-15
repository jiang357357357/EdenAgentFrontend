import type { CoreAssistant } from "./auth"
import type { SessionParticipant } from "./agent-client"

export function hasAssistantDetail(assistant?: CoreAssistant | null) {
  const character = assistant?.character
  return Boolean(
    character &&
    Array.isArray(character.visual_actions) &&
    Array.isArray(character.costumes) &&
    Array.isArray(character.spine_assets),
  )
}

export function resolveConversationAssistant(
  currentAssistant: CoreAssistant | null,
  availableAssistants: CoreAssistant[],
  conversationAssistantId?: string | number | null,
) {
  if (conversationAssistantId === undefined || conversationAssistantId === null) return currentAssistant
  const matches = (assistant?: CoreAssistant | null) =>
    Boolean(assistant && String(assistant.id) === String(conversationAssistantId))
  const listedAssistant = availableAssistants.find(matches)

  if (matches(currentAssistant) && hasAssistantDetail(currentAssistant)) return currentAssistant
  if (hasAssistantDetail(listedAssistant)) return listedAssistant
  if (matches(currentAssistant)) return currentAssistant
  // Never represent a stored conversation identity with a different current
  // assistant. The UI can then offer an explicit session rebind.
  return listedAssistant ?? null
}

export function assistantFromParticipantSnapshot(participant?: SessionParticipant): CoreAssistant | null {
  if (!participant) return null
  const assistantId = Number(participant.assistantID)
  const characterId = Number(participant.characterID ?? participant.assistantID)
  if (!Number.isSafeInteger(assistantId) || !Number.isSafeInteger(characterId)) return null
  return {
    id: assistantId,
    name: participant.assistantName || participant.characterName || `助手 ${assistantId}`,
    character_id: characterId,
    is_default: false,
    is_assistant_mode: true,
    character: {
      id: characterId,
      name: participant.characterName || participant.assistantName || `角色 ${characterId}`,
      signature: participant.signature,
      avatar_url: participant.avatarUrl,
      default_standing_image_url: participant.standingImageUrl,
      tts_config_id: participant.ttsConfigID,
      stt_config_id: participant.sttConfigID,
    },
  }
}
