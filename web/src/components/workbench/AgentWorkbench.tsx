import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { Workbench } from './Workbench'
import { useChatWorkbench } from './use-chat-workbench'
import { SessionChatEditor } from './SessionChatEditor'
import { Sidebar } from '../layout'
import { CharacterPanel } from '../character'
import { PermissionRequestCard } from '../requests'
import { defaultAppearance } from '../../lib/use-appearance-preference'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
import { pageEnterMotion } from '../../lib/page-motion'
import type { ChatPageProps } from '../../pages/chat/chat-page-props'
import { ChatConversation } from '../../pages/chat/ChatConversation'
import { ApplicationPageLayout } from './ApplicationPageLayout'
import { isApplicationPage } from './application-pages'
export function AgentWorkbench(props: ChatPageProps) {
  const {sessions,activeSessionId,currentUser,assistant,assistantError,activeCharacterAction,isThinking,backgroundPreference,backgroundImageUrl,appearancePreference,onSelectSession,onNewSession,applicationPage,onOpenPlugins,onDeleteSession,onRenameSession,onArchiveSession,onPinSession,onOpenAssistantSwitcher,onOpenDutyAssistantSwitcher,onOpenSelfAwake,onOpenAllSessions,onOpenMemo,onOpenSkills,onOpenConnectors,onOpenConfiguration,onLogout,onOpenSettings,onOpenSharedWorkspace,sidebarActivity,onSidebarActivityChange,activePendingPermissions,onPermissionReply}=props
  const [characterEditing,setCharacterEditing]=useState(false)
  const applicationActive=isApplicationPage(applicationPage?.id)
  const workbench=useChatWorkbench({account:String(currentUser?.id??'local'),sessionId:activeSessionId,sessions,onSelectSession,onNewSession,onShowChat:()=>applicationPage?.onChange('chat')})
  useEffect(()=>{
    if(!workbench.state.tabs.some(tab=>tab.kind==='page'&&tab.page==='character'))setCharacterEditing(false)
  },[workbench.state.tabs])
  useEffect(()=>{
    if(!characterEditing)return
    const finish=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open],:popover-open'))setCharacterEditing(false)
    }
    window.addEventListener('keydown',finish)
    return()=>window.removeEventListener('keydown',finish)
  },[characterEditing])
  return (<ApplicationPageLayout page={applicationPage} sessionId={activeSessionId}><motion.div
      key="chat-with-character"
      {...pageEnterMotion}
      className="chat-workspace theme-page fixed inset-0 z-10 flex h-[100vh] w-[100vw] overflow-hidden bg-bg interface-background interface-dark font-sans text-text"
      style={
        {
          "--interface-background-opacity": backgroundPreference.opacity / 100,
          "--interface-panel-background": `color-mix(in oklab, var(--color-bg) ${appearancePreference.panelOpacity ?? defaultAppearance.panelOpacity}%, transparent)`,
          "--interface-background-blur": `${backgroundPreference.blur}px`,
          "--interface-component-font-scale": appearancePreference.componentFontScale / 100,
          "--interface-component-font-delta": `${(appearancePreference.componentFontScale - 100) / 10}px`,
          "--interface-chat-font-delta": `${(appearancePreference.chatFontScale - 100) / 10}px`,
          ...(backgroundImageUrl ? { "--interface-background-image": `url(${backgroundImageUrl})` } : {}),
        } as React.CSSProperties
      }
    >
      <Workbench state={workbench.state} dispatch={workbench.dispatch} sessionId={activeSessionId} running={isThinking} active={!applicationActive}
        characterMenu={{origin:getStoredRuntimeOrigin()??'local',name:assistant?.name||assistant?.character?.name,
          onConfigure:view=>{if(props.onOpenCharacterConfiguration)props.onOpenCharacterConfiguration(view);else onOpenConfiguration()},
          onParticipants:onOpenAssistantSwitcher,onDefault:onOpenDutyAssistantSwitcher,
          editing:characterEditing,onToggleEditing:()=>{setCharacterEditing(!characterEditing);if(!characterEditing)workbench.openPortrait()},
          onShowPortrait:()=>{setCharacterEditing(false);workbench.openPortrait()}}}
        onSelect={workbench.select} onNewChat={workbench.newChat} onOpenPlugin={workbench.openPlugin} onManagePlugins={onOpenPlugins}
        onOpenPage={page=>applicationPage?.onChange(page)} error={workbench.error} onRetry={workbench.retry} hydrated={workbench.ready} storageKey={workbench.storageKey} renderChat={(tab, focused) => <SessionChatEditor key={tab.id} tab={tab} focused={focused} base={props} onSessionCreated={workbench.bindSession} />}
        portrait={<CharacterPanel showEmpty editing={characterEditing} assistant={assistant} assistantError={assistantError} activeAction={activeCharacterAction}
          onConfigure={()=>{if(getStoredRuntimeOrigin()==='local'&&props.onOpenCharacterConfiguration)props.onOpenCharacterConfiguration('visual');else onOpenAssistantSwitcher()}} />}
        sidebar={<Sidebar
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={workbench.openSession}
        onDelete={onDeleteSession}
        onRename={onRenameSession}
        onArchive={onArchiveSession}
        onPin={onPinSession}
        onNewSession={workbench.newChat}
        onOpenParticipants={onOpenAssistantSwitcher}
        onOpenDutyAssistant={onOpenDutyAssistantSwitcher}
        onOpenSelfAwake={onOpenSelfAwake}
        onOpenAllSessions={onOpenAllSessions}
        onOpenMemo={onOpenMemo}
        onOpenSkills={onOpenSkills}
        onOpenConnectors={onOpenConnectors}
        onOpenConfiguration={onOpenConfiguration}
        onLogout={onLogout}
        logoutLabel={getStoredRuntimeOrigin() === "local" ? "返回世界选择" : "退出登录"}
        onOpenSettings={onOpenSettings}
        onOpenFile={workbench.openFile}
        onWorkspaceChanged={workbench.resetFiles}
        onOpenSharedWorkspace={onOpenSharedWorkspace}
        activity={sidebarActivity}
        onActivityChange={onSidebarActivityChange}
      />}
      >
        {typeof document==='undefined'&&<ChatConversation {...props}/>}
      </Workbench>
      {activePendingPermissions.length > 0 && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-scrim/35 p-4 backdrop-blur-[2px]">
              <div className="grid max-h-[80vh] w-full max-w-2xl gap-3 overflow-y-auto">
                {activePendingPermissions.map((request) => (
                  <PermissionRequestCard
                    key={request.id}
                    request={request}
                    onReply={onPermissionReply}
                    tone="overlay"
                  />
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}

    </motion.div></ApplicationPageLayout>)
}
