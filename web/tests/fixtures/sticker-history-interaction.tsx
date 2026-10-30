import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { MessageBubble } from "../../src/components/chat/message/MessageBubble"
import { projectMessageEvents, createSessionEventProjector } from "../../src/lib/agent-client"
import { initialRuntimeState, runtimeReducer, hydrateSessionMessages, applyRuntimeEvent } from "../../src/lib/session-reducer"
import { selectActiveSession } from "../../src/lib/session-selectors"
import { buildReplyActionGroups } from "../../src/lib/reply-action-groups"
import { messageGroupPosition } from "../../src/lib/message-grouping"
import type { SessionEventInput } from "../../src/lib/session-event"

function check(value: unknown, message: string) { if (!value) throw new Error(message) }
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 60))
async function runStickerHistoryTests(page: { events: SessionEventInput[]; sessionId: string; stickerId: string }) {
  const host = document.createElement("div"); host.className = "interface-dark"; document.body.append(host)
  const root = createRoot(host)
  const draw = (runtime: typeof initialRuntimeState) => {
    const messages = selectActiveSession({ ...runtime, activeSessionId: page.sessionId })!.messages
    const groups = buildReplyActionGroups(messages)
    flushSync(() => root.render(<StrictMode><div className="mx-auto mt-12 w-[min(44rem,calc(100vw-2rem))] text-text">
      {messages.map((message, index) => <MessageBubble key={message.id} message={message}
        groupPosition={messageGroupPosition(messages, index)} replyGroup={groups.get(message.id)} onDeleteMessage={async () => {}} />)}
    </div></StrictMode>))
  }
  const assertPicture = async () => {
    for (let at = 0; at < 40; at++) {
      const image = host.querySelector<HTMLImageElement>('img[title="历史表情"]')
      if (image?.complete && image.naturalWidth >= 64 && image.getBoundingClientRect().width >= 64) {
        check(host.querySelectorAll('img[title="历史表情"]').length === 1, "Sticker must appear once")
        check(host.querySelectorAll('[aria-label="删除回答"]').length === 1, "One reply must have one footer")
        return image.currentSrc
      }
      await settle()
    }
    throw new Error(`Persisted image did not become visible: ${JSON.stringify({ images: [...host.querySelectorAll('img')].map(image => ({
      title: image.title, alt: image.alt, src: image.currentSrc || image.src, complete: image.complete, width: image.naturalWidth })),
      text: host.textContent?.slice(0, 500) })}`)
  }
  let live = initialRuntimeState
  const project = createSessionEventProjector()
  for (const event of page.events) for (const update of project(event)) live = runtimeReducer(live, applyRuntimeEvent(update))
  draw(live); const before = await assertPicture()
  flushSync(() => root.render(<p>已离开会话</p>)); await settle()
  const restored = runtimeReducer(initialRuntimeState, hydrateSessionMessages(page.sessionId, { items: projectMessageEvents(page.events), hasMore: false }))
  draw(restored); const after = await assertPicture()
  check(before === after, "Reopen must use the original persisted image")
  check(restored.sessions[page.sessionId].messages[page.stickerId]?.role === "assistant", "Reopen must retain the event's message identity")
  return { restored: true, imageLoaded: true, duplicateImages: false, sameImage: true, sharedFooter: true,
    stickerMessageId: page.stickerId, userDatabaseUsed: false }
}
Object.assign(window, { runStickerHistoryTests })
