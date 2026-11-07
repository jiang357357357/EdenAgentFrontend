import { matchesKeybinding } from './contribution-context'

export interface ExtensionKeyEvent {
  key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; editing: boolean
}
export interface ExtensionShortcut { owner: string; key: string; run(): void | Promise<void> }
const listeners = new Set<() => void>()
let bindings: readonly ExtensionShortcut[] = []
export function extensionShortcutOwner(pluginId: string, componentId: string, sessionId?: string) {
  return JSON.stringify([pluginId, componentId, sessionId ?? ''])
}
export function publishExtensionShortcuts(next: readonly ExtensionShortcut[]) {
  bindings = next; listeners.forEach(listener => listener())
}
export function observeExtensionShortcuts(owner: string, listener: (keys: string[]) => void) {
  const notify = () => listener(bindings.filter(binding => binding.owner === owner).map(binding => binding.key))
  listeners.add(notify); notify()
  return () => { listeners.delete(notify) }
}
export function runExtensionShortcut(event: ExtensionKeyEvent, owner?: string) {
  if (document.querySelector('dialog[open]')) return false
  if (event.editing && !event.ctrlKey && !event.metaKey && !event.altKey) return false
  const binding = bindings.find(binding => (!owner || binding.owner === owner) && matchesKeybinding(binding.key, event))
  if (!binding) return false
  void binding.run()
  return true
}
