import { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react'
import { useDocumentLifecycle } from './document-lifecycle'

export type PhoneState = 'idle' | 'dialing' | 'connected' | 'failed'
export type WorkbenchPhone = {
  documentId: string
  state: PhoneState
  unavailable: string
  open(): void
}

export const WorkbenchPhoneSlot = createContext<((phone: WorkbenchPhone) => () => void) | null>(null)

export function useWorkbenchPhone(state: PhoneState, unavailable: string, open: () => void) {
  const register = useContext(WorkbenchPhoneSlot)
  const documentId = useDocumentLifecycle()?.id
  const action = useRef(open)
  useLayoutEffect(() => { action.current = open }, [open])
  const activate = useCallback(() => action.current(), [])
  useLayoutEffect(() => {
    if (register && documentId) return register({ documentId, state, unavailable, open: activate })
  }, [register, documentId, state, unavailable, activate])
}
