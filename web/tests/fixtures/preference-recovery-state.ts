export const fixture = { scenario: new URLSearchParams(location.search).get('scenario'), account: 1,
  calls: [] as { method: string; account: number }[], release: [] as (() => void)[] }
const count = (method: string, account: number) => fixture.calls.filter(call => call.method === method && call.account === account).length
function value(method: string, account: number) {
  if (method === 'ui.preferences.get') return { autoScrollEnabled: account === 2 }
  if (method === 'ui.background.get') return { opacity: account === 2 ? 76 : 62, blur: 2, imageBlobId: null }
  return { baseTheme: account === 2 ? 'cream' : 'night', backgroundMode: 'theme', accentTheme: 'mist', chatFontScale: 100, componentFontScale: 100, panelOpacity: 92 }
}
export async function request(_origin: string, method: string) {
  const account = fixture.account
  fixture.calls.push({ method, account })
  if (method.endsWith('.update')) throw new Error('RPC connection closed; pending execution outcomes are unconfirmed')
  if (fixture.scenario === 'late' && account === 1) return new Promise(resolve => { fixture.release.push(() => resolve(value(method, account))) })
  if (fixture.scenario === 'denied' && method === 'ui.appearance.get') { const error = new Error('没有读取外观的权限'); error.name = 'AgentRpcError'; throw error }
  if (fixture.scenario === 'interrupted' && count(method, account) === 1) throw new Error('RPC connection closed; pending execution outcomes are unconfirmed')
  return value(method, account)
}
