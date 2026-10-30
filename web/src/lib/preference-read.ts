export const preferenceReadReconnecting = '界面设置读取中断，正在重新连接并读取。'

/** Only the three idempotent preference reads use this recovery path. Mutations are never replayed. */
export function isPreferenceReadConnectionError(reason: unknown): boolean {
  if (reason instanceof Error && reason.name === 'AgentRpcError') return false
  const message = reason instanceof Error ? reason.message : String(reason)
  return /^(?:RPC connection (?:closed|was replaced)|Eden Agent (?:RPC client is not connected|WebSocket connection (?:failed|timed out))|RPC send failed;|RPC ui\.(?:preferences|background|appearance)\.get timed out)/.test(message)
    || /^(?:与服务的网络连接意外中断|服务连接已关闭|服务处理异常，连接已中断|会话同步暂时繁忙，连接已中断|客户端接收速度过慢，连接已中断)$/.test(message)
}

export function recoverPreferenceRead<T>(options: {
  read(): Promise<T>; current(): boolean; loaded(value: T): void; failed(error?: string): void; label: string
}) {
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let attempts = 0
  const current = () => !disposed && options.current()
  const read = async () => {
    if (!current()) return
    try {
      const value = await options.read()
      if (current()) { options.failed(undefined); options.loaded(value) }
    } catch (reason) {
      if (!current()) return
      if (!isPreferenceReadConnectionError(reason)) {
        options.failed(`${options.label}：${reason instanceof Error ? reason.message : String(reason)}`)
        return
      }
      options.failed(preferenceReadReconnecting)
      timer = setTimeout(() => { timer = undefined; void read() }, Math.min(500 * 2 ** attempts++, 10000))
    }
  }
  void read()
  return () => { disposed = true; if (timer !== undefined) clearTimeout(timer) }
}
