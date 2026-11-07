import bootstrap from './webview-bootstrap.js?raw'

export function webviewDocument(html: string, theme: Record<string, string>) {
  const csp = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
  const variables = Object.entries(theme).filter(([name]) => /^--[a-z0-9-]+$/.test(name))
    .map(([name, value]) => `${name}:${value.replace(/[<>;{}]/g, '')}`).join(';')
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>:root{${variables}}body{margin:0;color:var(--color-text);background:var(--color-bg);font:14px system-ui}button,input,textarea,select{font:inherit}</style><script>${bootstrap.replace(/<\/script/gi, '<\\/script')}</script>`
  return /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, match => match + head)
    : `<!doctype html><html><head>${head}</head><body>${html}</body></html>`
}
