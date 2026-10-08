const fixture = () => window.speechFixture
export const resolveVoiceBlobUrl = async () => 'data:audio/wav;base64,UklGRg=='
export const listMessageSpeechSegments = async () => []
export const synthesizeSpeechSegment = async input => {
  fixture().calls.push(input)
  if (fixture().recover) return { success: true, audio_blob_id: 'fixture-audio' }
  const error = new Error('fixture transient Core rejection')
  error.data = { retryable: true, outcome: 'failed', status: 429 }
  throw error
}
export const authorizeAutomaticSpeechSynthesis = async () => true
export const claimDesktopSpeechPlayback = async () => ({ granted: false })
export const listenDesktopSpeechPlaybackControl = async () => () => {}
export const releaseDesktopSpeechPlayback = async () => true
export const reportSpeechDiagnostic = async (event, details) => { fixture().diagnostics.push({ event, details }); return true }
export const updateDesktopActivityFacts = async () => true
