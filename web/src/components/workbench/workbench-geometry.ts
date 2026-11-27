import { minimumEditorExtent } from './editor-layout'
import type { WorkbenchState } from './workbench-state'

/** Fit persisted pane preferences to available space rather than a desktop-width breakpoint. */
export function workbenchGeometry(state: WorkbenchState, width: number, height: number, auxiliary: boolean) {
  const minimum = minimumEditorExtent(state.layout)
  const desiredPanelSide = state.bottomOpen && (state.panelPosition === 'left' || state.panelPosition === 'right')
  const panelSpace = desiredPanelSide ? Math.min(state.panelWidth, width * .4) + 4 : 0
  const sidebarMax = Math.max(64, Math.min(440, Math.max(220, width * .25), width - 284))
  const sidebarWidth = state.sidebarOpen && sidebarMax >= 220 ? Math.min(state.sidebarWidth, sidebarMax) : 64
  const sidebarSpace = sidebarWidth + (sidebarWidth > 64 ? 4 : 0)
  const availableHeight = height - 64 - (state.bottomOpen && !desiredPanelSide ? state.bottomHeight + 4 : 0)
  const editorWidth = width - sidebarSpace - panelSpace
  const sideOverlay = auxiliary && editorWidth - 264 < minimum.width
  const compact = editorWidth < minimum.width || availableHeight < minimum.height
  const sideMax = Math.max(260, editorWidth - minimum.width - 4)
  const sideWidth = sideOverlay ? state.sideWidth : Math.min(state.sideWidth, sideMax)
  const panelSide = !compact && (state.panelPosition === 'left' || state.panelPosition === 'right')
  return { sidebarWidth, sidebarMax, sideWidth, sideMax, sideOverlay, compact, panelSide }
}
