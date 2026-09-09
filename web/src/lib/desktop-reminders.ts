import { desktopReminderSchema } from '@eden/api'
import { rpcRequestForOrigin } from './rpc-transport'
import type { RuntimeOrigin } from './runtime-origin'

export async function listDesktopReminders(origin: RuntimeOrigin) {
  return desktopReminderSchema.array().parse(await rpcRequestForOrigin(origin, 'desktop.reminder.list', { limit: 20, includeClosed: false }))
}
export function displayDesktopReminder(origin: RuntimeOrigin, id: string) { return rpcRequestForOrigin(origin, 'desktop.reminder.displayed', { id }) }
export function closeDesktopReminder(origin: RuntimeOrigin, id: string) { return rpcRequestForOrigin(origin, 'desktop.reminder.close', { id }) }
