import type { ExtensionWhen } from '@eden/api'

export interface ContributionContext { sessionAvailable: boolean; sessionRunning: boolean; activeView?: string }
export function matchesContribution(when: ExtensionWhen | undefined, context: ContributionContext) {
  return !when || Object.entries(when).every(([key, value]) => context[key as keyof ContributionContext] === value)
}
export function matchesKeybinding(key: string, event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>) {
  const parts = key.toLowerCase().split('+'), target = parts.pop()
  const has = (name: string) => parts.includes(name)
  if (parts.some(part => !['ctrl', 'cmd', 'ctrlcmd', 'shift', 'alt'].includes(part))) return false
  const mod = has('ctrlcmd') ? event.ctrlKey || event.metaKey : event.ctrlKey === has('ctrl') && event.metaKey === has('cmd')
  return mod && event.shiftKey === has('shift') && event.altKey === has('alt') && event.key.toLowerCase() === target
}
