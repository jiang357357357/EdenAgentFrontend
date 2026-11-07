/** Native visibility remains authoritative when Electron disables background throttling. */
export function observeRendererVisibility(onChange: (visible: boolean) => void): () => void {
  let nativeVisible = true, disposed = false
  const publish = () => { if (!disposed) onChange(nativeVisible && !document.hidden) }
  document.addEventListener('visibilitychange', publish)
  // Auxiliary windows do not receive main-window events; their own document
  // visibility continues to apply, so a visible desktop pet keeps animating.
  const unsubscribe = window.edenAgentDesktop?.onMainWindowVisibility?.(visible => {
    nativeVisible = visible
    publish()
  })
  publish()
  return () => {
    disposed = true
    document.removeEventListener('visibilitychange', publish)
    unsubscribe?.()
  }
}
