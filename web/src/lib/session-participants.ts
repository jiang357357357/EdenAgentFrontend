import type { JsonValue } from '@eden/api'
import { fetchAssistant, getStoredToken } from './auth'
import { getStoredRuntimeOrigin, getRuntimeOriginRevision, LOCAL_ASSISTANT_ID } from './runtime-origin'
import { getStoredLocalCharacter, localCharacterParticipantProfile } from './local-character'
import { resolveDesktopFileUrl } from './desktop-window'

export function captureParticipantIdentity() {
  const origin = getStoredRuntimeOrigin() ?? 'mon'
  const revision = getRuntimeOriginRevision()
  const token = origin === 'mon' ? getStoredToken() : null
  return { origin, token, assertCurrent() {
    if ((getStoredRuntimeOrigin() ?? 'mon') !== origin || getRuntimeOriginRevision() !== revision) throw new Error('World changed while preparing session participants')
    if (origin === 'mon' && getStoredToken() !== token) throw new Error('Core account changed while preparing session participants')
  } }
}

export async function resolveParticipants(assistantIDs: Array<number | string>, identity: ReturnType<typeof captureParticipantIdentity>) {
  identity.assertCurrent()
  if (identity.origin === "local") {
    const localCharacter = getStoredLocalCharacter()
    const avatarUrl = resolveDesktopFileUrl(localCharacter.avatarPath)
    const standingImageUrl = resolveDesktopFileUrl(localCharacter.standingImagePath)
    return assistantIDs.map((_assistantID, position) => ({
      assistantId: LOCAL_ASSISTANT_ID,
      assistantName: localCharacter.name,
      characterId: LOCAL_ASSISTANT_ID,
      characterName: localCharacter.name,
      signature: localCharacter.signature,
      avatarUrl,
      standingImageUrl,
      ttsConfigId: null,
      sttConfigId: null,
      position,
      profile: localCharacterParticipantProfile(localCharacter),
    }))
  }
  return Promise.all(assistantIDs.map(async (assistantID, position) => {
    let assistant: Awaited<ReturnType<typeof import("./auth").fetchAssistant>> | undefined
    const numericId = Number(assistantID)
    if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error("Invalid Core assistant identity")
    try {
      identity.assertCurrent()
      if (identity.token) assistant = await fetchAssistant(identity.token, numericId)
    } catch {
      // The durable session can retain an assistant ID while Core is temporarily unavailable.
    }
    identity.assertCurrent()
    if (assistant && assistant.id !== numericId) throw new Error("Core returned a different assistant identity")
    const character = assistant?.character
    return {
      assistantId: assistantID,
      assistantName: assistant?.name ?? character?.name ?? `助手 ${String(assistantID)}`,
      characterId: character?.id ?? null,
      characterName: character?.name ?? "",
      signature: character?.signature ?? "",
      avatarUrl: character?.avatar_url ?? "",
      standingImageUrl: character?.default_standing_image_url ?? "",
      ttsConfigId: character?.tts_config_id == null ? null : Number(character.tts_config_id),
      sttConfigId: character?.stt_config_id == null ? null : Number(character.stt_config_id),
      position,
      profile: assistant == null ? null : JSON.parse(JSON.stringify(assistant)) as JsonValue,
    }
  }))
}
