const fixture = () => window.speechFixture
export const resolveVoiceBlobUrl = async id => `fixture-audio:${id}`
export const listMessageSpeechSegments = async () => []
export const synthesizeSpeechSegment = async input => {
  fixture().calls.push(input)
  return { success: true, audio_blob_id: `${input.messageId}:${input.sequence}` }
}
export const authorizeAutomaticSpeechSynthesis = async () => true
export const claimDesktopSpeechPlayback = async (_surface, key) => ({ granted: true, leaseId: key })
export const listenDesktopSpeechPlaybackControl = async () => () => {}
export const releaseDesktopSpeechPlayback = async () => true
export const reportSpeechDiagnostic = async (event, details) => { fixture().diagnostics.push({ event, details }); return true }
export const updateDesktopActivityFacts = async () => true
