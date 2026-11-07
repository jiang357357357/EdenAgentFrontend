import type { ApplicationPageRoute } from '../../components/workbench/application-pages'
import type { SharedWorkspaceScope } from '../../components/shared-workspace/use-shared-workspace'
import type { ActiveCharacterAction, AuthUser, CoreAssistant } from '../../lib/auth'
import type { ConnectionFeedbackState } from '../../lib/connection-feedback'
import type { CharacterConfigurationView } from '../../lib/character-navigation'
import type { BackgroundPreference } from '../../lib/use-background-preference'
import type { AppearancePreference } from '../../lib/use-appearance-preference'
import type { PendingPermission, MessageData, PermissionMode, PromptAttachment, Session, SubagentThreadDetails } from '../../types'
import type { RefObject } from 'react'
export interface ChatPageProps {
  sessions: Session[]
  activeSessionId: string
  activeSession?: Session
  currentUser?: AuthUser | null
  assistant?: CoreAssistant | null
  assistantError?: string
  activeCharacterAction?: ActiveCharacterAction
  isThinking: boolean
  connectionFeedback: ConnectionFeedbackState
  onDismissConnectionFeedback: () => void
  onRetryConnectionSync: () => void
  runtimeError?: string
  activePendingPermissions: PendingPermission[]
  messagesScrollRef: RefObject<HTMLDivElement | null>
  messagesEndRef: RefObject<HTMLDivElement | null>
  autoScrollReady?: boolean
  autoScrollEnabled: boolean
  onAutoScrollChange: (enabled: boolean) => void
  backgroundPreference: BackgroundPreference
  backgroundImageUrl?: string
  backgroundReady: boolean
  backgroundUploading: boolean
  backgroundSaving: boolean
  appearanceSettingError?: string
  onBackgroundChange: (value: BackgroundPreference) => void
  onBackgroundImageSelect: (file: File) => Promise<void>
  appearancePreference: AppearancePreference
  appearanceReady: boolean
  appearanceSaving: boolean
  onAppearanceChange: (value: AppearancePreference) => void
  onLoadOlderMessages: () => Promise<void>
  onHistoryBrowsingChange?: (browsing: boolean) => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => Promise<void>
  onDeleteMessage: (sessionId: string, messageId: string) => Promise<void>
  onReadReplyText: (sessionId: string, messageId: string) => Promise<string>
  onRenameSession: (id: string, title: string) => Promise<void>
  onArchiveSession: (id: string, archived: boolean) => Promise<void>
  onPinSession: (id: string, pinned: boolean) => Promise<void>
  onNewSession: () => void
  onSendMessage: (content: string, attachments: PromptAttachment[]) => Promise<void>
  onCompact: (instructions?: string) => Promise<void>
  onAbort: () => Promise<void>
  onFollowupSubagent: (target: string, message: string) => Promise<unknown>
  onGetSubagentDetails: (target: string) => Promise<SubagentThreadDetails>
  onInterruptSubagent: (target: string) => Promise<unknown>
  onPermissionReply: (requestID: string, reply: "once" | "always" | "reject", message?: string) => Promise<void>
  permissionMode: PermissionMode
  onPermissionModeChange: (mode: PermissionMode) => Promise<void>
  onPreviewImage: (src: string, alt?: string) => void
  onLogout: () => Promise<void> | void
  onOpenAssistantSwitcher: () => void
  onOpenDutyAssistantSwitcher: () => void
  onOpenSessionAssistantSwitcher: () => void
  onOpenSettings: () => void
  onOpenPlugins?: () => void
  applicationPage?: ApplicationPageRoute
  focused?: boolean
  onOpenSelfAwake: () => void
  onOpenAllSessions: () => void
  onOpenMemo: () => void
  onOpenSkills: () => void
  onOpenConnectors: () => void
  onOpenConfiguration: () => void
  onOpenCharacterConfiguration?: (view: CharacterConfigurationView) => void
  onOpenSharedWorkspace: (scope: SharedWorkspaceScope) => void
  sidebarActivity: "sessions" | "files"
  onSidebarActivityChange: (activity: "sessions" | "files") => void
}

