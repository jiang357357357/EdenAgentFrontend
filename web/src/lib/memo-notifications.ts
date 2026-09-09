import { memoNotificationListResultSchema } from '@eden/api'
import { rpcRequestForOrigin } from './rpc-transport'
import type { RuntimeOrigin } from './runtime-origin'

export async function listMemoNotifications(origin: RuntimeOrigin) {
  return memoNotificationListResultSchema.parse(await rpcRequestForOrigin(origin, 'memo.notification.list', { limit: 80 }))
}
export function acknowledgeMemoNotification(origin: RuntimeOrigin, id: string) {
  return rpcRequestForOrigin(origin, 'memo.notification.acknowledge', { id })
}
