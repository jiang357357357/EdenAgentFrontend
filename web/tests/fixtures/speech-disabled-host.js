const fixture = () => window.speechFixture
export const resolveVoiceBlobUrl = async () => { fixture().rpcCalls += 1; throw new Error('Unexpected voice blob request') }
export const listMessageSpeechSegments = async () => { fixture().rpcCalls += 1; throw new Error('Unexpected speech history request') }
export const synthesizeSpeechSegment = async () => { fixture().rpcCalls += 1; throw new Error('Unexpected speech synthesis request') }
export const authorizeAutomaticSpeechSynthesis = async () => true
export const claimDesktopSpeechPlayback = async () => ({ granted: false })
export const listenDesktopSpeechPlaybackControl = async () => () => {}
export const releaseDesktopSpeechPlayback = async () => { fixture().releases += 1; return true }
export const reportSpeechDiagnostic = async (event, details) => { fixture().diagnostics.push({ event, details }); return true }
export const updateDesktopActivityFacts = async () => true
