import { createContext, useContext } from 'react'

/** A document owns its controls even when the group header hosts their DOM. */
export const WorkbenchToolbarSlot = createContext<HTMLElement | null>(null)
export const useWorkbenchToolbarSlot = () => useContext(WorkbenchToolbarSlot)
