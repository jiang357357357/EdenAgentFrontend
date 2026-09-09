/** Wait for the server's start acknowledgement; all temporary listeners belong to this handshake. */
export function startRealtimeSpeech(socket: WebSocket, options: { configId?: number; endSilenceMs?: number }, isCurrent: () => boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      window.clearTimeout(timer)
      socket.removeEventListener('open', opened)
      socket.removeEventListener('message', message)
      socket.removeEventListener('error', failed)
      socket.removeEventListener('close', closed)
    }
    const finish = (error?: Error, behavior?: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(behavior)
    }
    const opened = () => {
      if (!isCurrent()) { finish(new Error('语音输入已取消')); return }
      try {
        socket.send(JSON.stringify({ command: 'start',
          ...(typeof options.configId === 'number' ? { config_id: options.configId } : {}),
          ...(typeof options.endSilenceMs === 'number' ? { end_silence_ms: options.endSilenceMs } : {}),
        }))
      } catch { finish(new Error('无法发送语音识别启动请求')) }
    }
    const message = (event: MessageEvent) => {
      if (!isCurrent()) { finish(new Error('语音输入已取消')); return }
      if (typeof event.data !== 'string') return
      if (event.data.length > 262144) { finish(new Error('语音识别启动响应过大')); return }
      let payload: unknown
      try { payload = JSON.parse(event.data) } catch { return }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return
      const data = payload as Record<string, unknown>
      if (data.type === 'status' && data.status === 'started') finish(undefined, data.input_behavior)
      else if (data.type === 'error') finish(new Error(typeof data.message === 'string' ? data.message.slice(0, 2000) : '语音识别启动失败'))
    }
    const failed = () => finish(new Error('无法连接语音识别服务'))
    const closed = () => finish(new Error('语音识别连接已关闭'))
    const timer = window.setTimeout(() => finish(new Error('连接语音识别服务超时')), 8000)
    socket.addEventListener('open', opened, { once: true })
    socket.addEventListener('message', message)
    socket.addEventListener('error', failed, { once: true })
    socket.addEventListener('close', closed, { once: true })
    if (socket.readyState === WebSocket.OPEN) opened()
    else if (socket.readyState !== WebSocket.CONNECTING) closed()
  })
}
