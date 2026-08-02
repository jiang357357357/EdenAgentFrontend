import type { PetTTSMode } from "../../../lib/desktop-window"
import type { PetDialogSegmentInput } from "../../../lib/pet-dialog-segments"
import type { MessageData, PendingPermission, PendingQuestion, PromptAttachment } from "../../../types"

export interface DesktopPetChatBubbleProps {
  assistantName: string
  sessionId?: string
  sttConfigId?: number | null
  ttsConfigId?: number | null
  voiceInputEnabled: boolean
  ttsMode: PetTTSMode
  latestAssistantMessage?: MessageData
  dialogSegments: PetDialogSegmentInput[]
  isThinking: boolean
  permissions: PendingPermission[]
  questions: PendingQuestion[]
  opacity: number
  fontScale: number
  onSend: (content: string, attachments: PromptAttachment[]) => Promise<void>
  onAbort: () => Promise<void>
  onPermissionReply: (requestID: string, reply: "once" | "always" | "reject") => Promise<void>
  onQuestionReply: (requestID: string, answers: string[][]) => Promise<void>
  onQuestionReject: (requestID: string) => Promise<void>
}
