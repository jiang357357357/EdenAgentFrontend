import { useEffect, useState } from 'react'

export function useStartupOpeningReplay(initialOpening = true) {
  const [state, setState] = useState({ opening: initialOpening, visible: true, sequence: 0 })
  useEffect(() => window.edenAgentDesktop?.onMainWindowVisibility?.(visible => {
    setState(current => {
      if (current.visible === visible) return current
      // Prepare the cover while hidden; its playback starts when the window appears.
      if (!visible) return { opening: true, visible: false, sequence: current.sequence + 1 }
      return { ...current, visible: true }
    })
  }), [])
  const complete = () => setState(current => {
    if (current.sequence !== state.sequence || !current.visible) return current
    return { ...current, opening: false }
  })
  return { ...state, complete }
}
