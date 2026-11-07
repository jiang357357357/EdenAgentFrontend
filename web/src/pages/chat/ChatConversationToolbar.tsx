import { Lock, LockOpen } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useWorkbenchToolbarSlot } from '../../components/workbench/workbench-toolbar-slot'
import { RuntimeDiagnostics } from '../../components/chat/RuntimeDiagnostics'
import { ReplyLengthControls } from '../../components/chat/ReplyLengthControls'
import { BackgroundControls } from '../../components/chat/BackgroundControls'
import { cn } from '../../lib/utils'
import type { ChatPageProps } from './chat-page-props'
type Props = Pick<ChatPageProps,'activeSessionId'|'sessions'|'activeSession'|'assistant'|'backgroundPreference'|'backgroundReady'|'backgroundUploading'|'backgroundSaving'|'appearanceSaving'|'appearanceSettingError'|'appearancePreference'|'appearanceReady'|'onBackgroundChange'|'onAppearanceChange'|'onBackgroundImageSelect'|'onAutoScrollChange'|'autoScrollEnabled'|'autoScrollReady'> & { assistantName: string }
export function ChatConversationToolbar({activeSessionId,sessions,activeSession,assistant,assistantName,backgroundPreference,backgroundReady,backgroundUploading,backgroundSaving,appearanceSaving,appearanceSettingError,appearancePreference,appearanceReady,onBackgroundChange,onAppearanceChange,onBackgroundImageSelect,onAutoScrollChange,autoScrollEnabled,autoScrollReady}: Props) {
  const target = useWorkbenchToolbarSlot()
  const Container = target ? 'div' : 'header'
  const controls = <Container role={target ? 'toolbar' : undefined} aria-label="会话工具栏" className={target ? 'workbench-chat-tools' : 'flex h-10 min-w-0 border-b border-border bg-bg/80'}>
          <div className="chat-conversation-actions ml-auto flex h-full shrink-0 items-center px-1.5">
            {activeSessionId && (
              <RuntimeDiagnostics
                key={`diagnostics-${activeSessionId}`}
                iconOnly
                sessions={sessions}
                activeSessionId={activeSessionId}
              />
            )}
            <ReplyLengthControls characters={activeSession?.participants?.length
              ? activeSession.participants.filter(item => item.characterID != null).map(item => ({ id: String(item.characterID), name: item.characterName || item.assistantName || "角色" }))
              : assistant?.character?.id != null ? [{ id: String(assistant.character.id), name: assistantName }] : []} />
            <BackgroundControls
              value={backgroundPreference}
              ready={backgroundReady}
              uploading={backgroundUploading}
              saving={backgroundSaving || appearanceSaving}
              settingError={appearanceSettingError}
              appearance={appearancePreference}
              appearanceReady={appearanceReady}
              onChange={onBackgroundChange}
              onAppearanceChange={onAppearanceChange}
              onSelectImage={onBackgroundImageSelect}
            />
            <button
              type="button"
              onClick={() => onAutoScrollChange(!autoScrollEnabled)}
              disabled={!autoScrollReady}
              aria-pressed={autoScrollEnabled}
              aria-label={autoScrollEnabled ? "关闭新消息自动滚动" : "开启新消息自动滚动"}
              title={
                autoScrollEnabled
                    ? "新消息自动滚动：开启"
                    : "新消息自动滚动：关闭"
              }
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                autoScrollEnabled
                  ? "bg-card text-text shadow-sm"
                  : "text-text-muted hover:bg-bg hover:text-text",
              )}
            >
              {autoScrollEnabled ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            </button>
          </div>
        </Container>
  return target ? createPortal(controls, target) : controls
}
