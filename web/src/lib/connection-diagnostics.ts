import type { RpcCloseInfo } from './rpc-client'

/** Classify transport evidence only; a closed connection does not establish a model or tool failure. */
export function connectionCloseMessage(info: RpcCloseInfo): string {
  if (info.reason === 'event sequence gap') return '会话状态需要重新同步'
  if (['invalid session event', 'invalid server warning', 'invalid RPC envelope'].includes(info.reason))
    return '收到无效的服务消息，连接已中断'
  if (info.reason === 'event stream lagged') return '会话同步暂时繁忙，连接已中断'
  if (info.code === 1008 && /^Core account authentication (?:failed|expired)$/.test(info.reason))
    return 'Core 账号验证失败，连接已中断'
  if (info.code === 1013) return info.reason === 'Event consumer did not drain the connection'
    ? '客户端接收速度过慢，连接已中断' : '会话同步暂时繁忙，连接已中断'
  if (info.code === 1006) return '与服务的网络连接意外中断'
  if (info.code === 1011) return '服务处理异常，连接已中断'
  if (info.code === 1008) return info.reason === 'Request queue limit exceeded'
    ? '连接请求过于频繁，服务已关闭连接' : '服务拒绝了当前连接'
  if (info.code === 1000 && info.reason === 'client closed') return '客户端已关闭连接'
  if (info.code === 1000 || info.code === 1001) return '服务连接已关闭'
  return `服务连接已中断（代码 ${info.code}）`
}
