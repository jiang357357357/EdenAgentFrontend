import {useState,useRef,useMemo,useEffect,useLayoutEffect,type RefObject} from 'react'
import type {MessageData} from '../../types'
const VISIBLE_CONVERSATION_TURNS = 10
const CONVERSATION_TURN_STEP = 5

function conversationTurnStarts(messages: MessageData[]): number[] {
  if (messages.length === 0) return []
  const starts = messages.flatMap((message, index) => (message.role === "user" ? [index] : []))
  if (starts.length === 0) return [0]
  // Runtime/compaction records can precede the first visible user message.
  // Keep that prelude attached to the first complete conversation turn.
  starts[0] = 0
  return starts
}

export function useConversationWindow({messages,activeSessionId,messagesScrollRef,onHistoryBrowsingChange}:{messages:MessageData[];activeSessionId:string;messagesScrollRef:RefObject<HTMLDivElement|null>;onHistoryBrowsingChange:(value:boolean)=>void}) {
  const [visibleWindowStartID, setVisibleWindowStartID] = useState<string>()
  const pendingOlderWindowRef = useRef(false)
  const messageAnchorRefs = useRef(new Map<string, HTMLSpanElement>())
  const windowScrollAdjustmentRef = useRef<{ anchorID: string; viewportTop: number } | undefined>(undefined)
  const turnStarts = useMemo(() => conversationTurnStarts(messages), [messages])
  const anchoredTurnIndex = visibleWindowStartID
    ? turnStarts.findIndex((messageIndex) => messages[messageIndex]?.id === visibleWindowStartID)
    : -1
  const latestWindowStart = Math.max(0, turnStarts.length - VISIBLE_CONVERSATION_TURNS)
  const visibleTurnStart = anchoredTurnIndex >= 0 ? anchoredTurnIndex : latestWindowStart
  const visibleTurnEnd = Math.min(turnStarts.length, visibleTurnStart + VISIBLE_CONVERSATION_TURNS)
  const visibleMessageStart = turnStarts[visibleTurnStart] ?? 0
  const visibleMessageEnd = turnStarts[visibleTurnEnd] ?? messages.length
  useEffect(() => {
    onHistoryBrowsingChange(Boolean(visibleWindowStartID || pendingOlderWindowRef.current))
  }, [visibleWindowStartID, activeSessionId, messages.length, onHistoryBrowsingChange])

  useEffect(() => {
    setVisibleWindowStartID(undefined)
    pendingOlderWindowRef.current = false
    windowScrollAdjustmentRef.current = undefined
  }, [activeSessionId])

  const moveConversationWindow = (direction: "older" | "newer") => {
    const element = messagesScrollRef.current
    if (!element || turnStarts.length === 0) return false
    const nextStart =
      direction === "older"
        ? Math.max(0, visibleTurnStart - CONVERSATION_TURN_STEP)
        : Math.min(latestWindowStart, visibleTurnStart + CONVERSATION_TURN_STEP)
    if (nextStart === visibleTurnStart) return false
    const anchorID = direction === "older" ? messages[visibleMessageStart]?.id : messages[turnStarts[nextStart]]?.id
    const anchor = anchorID ? messageAnchorRefs.current.get(anchorID) : undefined
    if (anchorID && anchor) {
      windowScrollAdjustmentRef.current = { anchorID, viewportTop: anchor.getBoundingClientRect().top }
    }
    setVisibleWindowStartID(nextStart === latestWindowStart ? undefined : messages[turnStarts[nextStart]]?.id)
    return true
  }

  useLayoutEffect(() => {
    const adjustment = windowScrollAdjustmentRef.current
    const element = messagesScrollRef.current
    if (!adjustment || !element) return
    const anchor = messageAnchorRefs.current.get(adjustment.anchorID)
    if (anchor) {
      element.scrollTop += anchor.getBoundingClientRect().top - adjustment.viewportTop
    }
    windowScrollAdjustmentRef.current = undefined
  }, [visibleWindowStartID, messagesScrollRef])

  useEffect(() => {
    if (!pendingOlderWindowRef.current || !visibleWindowStartID) return
    if (anchoredTurnIndex <= 0) return
    pendingOlderWindowRef.current = false
    moveConversationWindow("older")
  }, [anchoredTurnIndex, messages.length, visibleWindowStartID])

 return {turnStarts,visibleWindowStartID,setVisibleWindowStartID,pendingOlderWindowRef,messageAnchorRefs,windowScrollAdjustmentRef,latestWindowStart,visibleTurnStart,visibleTurnEnd,visibleMessageStart,visibleMessageEnd,moveConversationWindow}
}
