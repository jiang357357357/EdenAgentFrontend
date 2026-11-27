import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSessionRuntime } from '../../hooks/useSessionRuntime'
import { ChatConversation } from '../../pages/chat/ChatConversation'
import type { ChatPageProps } from '../../pages/chat/chat-page-props'
import { assistantFromParticipantSnapshot } from '../../lib/assistant-detail'
import { PluginUiSession } from '../plugin-ui/PluginUiProvider'
import type { WorkbenchTab } from './workbench-state'
import type { ChatParticipantSelection } from './application-pages'

export function SessionChatEditor({ tab, focused, base, onSessionCreated, registerChatSelection, onOpenSessionAssistantSwitcher }: {
  tab: WorkbenchTab & { kind: 'chat' }; focused: boolean; base: ChatPageProps
  onSessionCreated: (documentId: string, sessionId: string) => void
  registerChatSelection: (selection: ChatParticipantSelection) => () => void
  onOpenSessionAssistantSwitcher: () => void
}) {
  const runtime = useSessionRuntime(true, { initialSessionID: tab.sessionId, autoSelectFirst: false,
    manageGlobalRequests: false, sessionOnly: true, defaultParticipantID: base.defaultParticipantID })
  const messagesScrollRef = useRef<HTMLDivElement>(null), messagesEndRef = useRef<HTMLDivElement>(null)
  const [historyBrowsing, setHistoryBrowsing] = useState(false)
  const [autoScroll, setAutoScroll] = useState(base.autoScrollEnabled)
  useEffect(() => {
    if (!tab.sessionId && runtime.activeSessionId) onSessionCreated(tab.id, runtime.activeSessionId)
  }, [tab.id, tab.sessionId, runtime.activeSessionId])
  const selected = runtime.activeSession
  const participants = selected?.participants
  const { activeSessionId, draftParticipantIDs, updateSessionParticipants } = runtime
  useLayoutEffect(() => {
    if (activeSessionId && !participants) return
    return registerChatSelection({
      documentId: tab.id,
      title: selected?.title || tab.title,
      participantIDs: activeSessionId ? participants?.map(participant => participant.assistantID) ?? [] : draftParticipantIDs,
      updateParticipants: updateSessionParticipants,
    })
  }, [activeSessionId, draftParticipantIDs, participants, registerChatSelection, selected?.title, tab.id, tab.title, updateSessionParticipants])
  const participant = selected?.participants?.[0]
  const assistant = participant && String(participant.assistantID) !== String(base.assistant?.id)
    ? assistantFromParticipantSnapshot(participant) : base.assistant
  useLayoutEffect(() => {
    if (!autoScroll || historyBrowsing) return
    const element = messagesScrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [selected?.messages, runtime.pendingQuestions, focused, autoScroll, historyBrowsing])
  const bindings: ChatPageProps = { ...base, focused, sessions: runtime.sessions,
    activeSessionId: runtime.activeSessionId, activeSession: selected, assistant,
    activeCharacterAction: runtime.activeSessionId === base.activeSessionId ? base.activeCharacterAction : undefined,
    isThinking: runtime.isThinking, connectionFeedback: runtime.connectionFeedback,
    onDismissConnectionFeedback: runtime.dismissConnectionFeedback, onRetryConnectionSync: runtime.retryConnectionSync,
    runtimeError: runtime.runtimeError, activePendingPermissions: [], messagesScrollRef, messagesEndRef,
    onHistoryBrowsingChange: value => { setHistoryBrowsing(value); runtime.setHistoryBrowsing(value) },
    onLoadOlderMessages: runtime.loadOlderMessages, autoScrollReady: true, autoScrollEnabled: autoScroll,
    onAutoScrollChange: setAutoScroll, onSendMessage: runtime.sendMessage, onCompact: runtime.compactSession,
    onOpenSessionAssistantSwitcher,
    onPrepareDraftVoiceCall: runtime.prepareDraftVoiceCall,
    onAbort: async () => { await runtime.abortSession() }, onDeleteMessage: runtime.deleteMessage, onReadReplyText: runtime.readReplyText,
    onPermissionReply: runtime.respondPermission, permissionMode: runtime.permissionMode,
    activePendingQuestions: runtime.pendingQuestions, onQuestionReply: runtime.answerQuestion, onQuestionReject: runtime.dismissQuestion,
    onPermissionModeChange: runtime.updatePermissionMode, onFollowupSubagent: runtime.followupSubagent,
    onGetSubagentDetails: runtime.getSubagentThreadDetails, onInterruptSubagent: runtime.interruptSubagent,
  }
  return <PluginUiSession sessionId={runtime.activeSessionId || undefined}><ChatConversation {...bindings} /></PluginUiSession>
}
