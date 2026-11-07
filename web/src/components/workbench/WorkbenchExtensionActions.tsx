import { Puzzle } from 'lucide-react'
import type { ExtensionMenuEntry } from './use-extension-workbench'

export function WorkbenchExtensionActions({ menus, location, onError }: {
  menus: ExtensionMenuEntry[]; location: 'toolbar' | 'activity'; onError(message: string): void
}) {
  return <>{menus.filter(menu => menu.location === location).map(menu => <button type="button" key={menu.command.id}
    aria-label={menu.command.title} title={menu.command.title}
    className={location === 'toolbar' ? 'workbench-command' : 'flex min-h-16 w-full flex-col items-center justify-center gap-1 border-l-2 border-transparent p-2 text-xs text-text-muted hover:bg-surface-hover hover:text-text'}
    onClick={() => { void Promise.resolve(menu.command.run()).catch(reason => onError(String(reason))) }}>
    {location === 'activity' && <Puzzle className="h-5 w-5" />}<span className="max-w-full truncate">{menu.title}</span>
  </button>)}</>
}
