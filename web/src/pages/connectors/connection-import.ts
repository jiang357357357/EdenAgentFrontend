export interface ConnectionImport { connectorKey: string; identityKey: string; settings: Record<string, unknown> }
function importedSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('接入配置设置必须是对象')
  const settings = value as Record<string, unknown>
  if (Object.keys(settings).some(key => key !== 'endpoint') || typeof settings.endpoint !== 'string') throw new Error('接入配置只允许包含服务地址，凭据需单独保存')
  const url = new URL(settings.endpoint)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('抖音服务必须是本机回环地址')
  return { endpoint: url.origin }
}
export function parseConnectionImport(text: string): ConnectionImport {
  if (text.length > 16384) throw new Error('接入配置过大')
  const value = JSON.parse(text) as Record<string, unknown>
  if (!value || Array.isArray(value) || value.schemaVersion !== 1 || value.connectorKey !== 'douyinbot'
    || typeof value.identityKey !== 'string' || !/^\d{1,40}$/.test(value.identityKey)) throw new Error('抖音接入配置格式不正确')
  if (Object.keys(value).some(key => !['schemaVersion', 'connectorKey', 'identityKey', 'settings'].includes(key))) throw new Error('接入配置包含未知字段，请重新导出不含凭据的配置')
  return { connectorKey: value.connectorKey, identityKey: value.identityKey, settings: importedSettings(value.settings) }
}
