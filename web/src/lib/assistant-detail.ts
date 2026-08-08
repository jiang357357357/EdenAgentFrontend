import type { CoreAssistant } from "./auth"

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
  return listedAssistant ?? currentAssistant
}

