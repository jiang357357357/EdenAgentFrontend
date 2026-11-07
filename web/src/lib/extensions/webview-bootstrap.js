// Runs inside an opaque-origin frame. Never include host tokens or internal RPC endpoints here.
(() => {
  let port, initial, state = null, sequence = 0, keybindings = []
  const pending = new Map(), listeners = new Set(), connectorListeners = new Set()
  const configurationListeners = new Set()
  const diagnostics = []
  let diagnosticTimer, diagnosticCount = 0
  function report(kind, value) {
    if (diagnosticCount++ >= 100) return
    const message = String(value || '未知错误').slice(0, 2000)
    diagnostics.push({ kind, message })
    if (port && !diagnosticTimer) diagnosticTimer = setTimeout(flushDiagnostics, 250)
  }
  function flushDiagnostics() {
    diagnosticTimer = undefined
    if (!port || !diagnostics.length) return
    port.postMessage({ type: 'diagnostic', entries: diagnostics.splice(0, 20) })
    if (diagnostics.length) diagnosticTimer = setTimeout(flushDiagnostics, 250)
  }
  function location(value) {
    try { const url = new URL(String(value), document.baseURI); return url.origin === 'null' ? url.protocol : url.origin + url.pathname }
    catch { return '未知资源' }
  }
  window.addEventListener('error', event => {
    if (event.target !== window && event.target?.tagName) report('network', `${event.target.tagName} 加载失败：${location(event.target.src || event.target.href)}`)
    else report('error', event.message || event.error || '页面脚本异常')
  }, true)
  window.addEventListener('unhandledrejection', event => report('unhandledrejection', event.reason))
  document.addEventListener('securitypolicyviolation', event => report('csp', `${event.effectiveDirective}: ${location(event.blockedURI)}`))
  for (const level of ['warn', 'error']) {
    const original = console[level].bind(console)
    console[level] = (...values) => { original(...values); report('console', `${level}: ${values.map(value => value instanceof Error ? value.message : typeof value === 'string' ? value : '[对象]').join(' ')}`) }
  }
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input, options) => originalFetch(input, options).then(response => {
    if (!response.ok) report('network', `HTTP ${response.status}: ${location(typeof input === 'string' ? input : input.url)}`)
    return response
  }, error => { report('network', `请求失败 ${location(typeof input === 'string' ? input : input.url)}: ${String(error)}`); throw error })
  let save
  const ready = new Promise(resolve => {
    const connect = event => {
      if (event.source !== parent || event.data?.type !== 'eden-extension-connect' || !event.ports[0]) return
      window.removeEventListener('message', connect)
      port = event.ports[0]; initial = event.data.context; state = initial.state ?? null
      flushDiagnostics()
      port.onmessage = async ({ data }) => {
        if (data?.type === 'keybindings') { keybindings = data.keys; return }
        if (data?.type === 'configuration') { configurationListeners.forEach(listener => { try { listener(data.keys) } catch (error) { console.error(error) } }); return }
        if (data?.type === 'message') { listeners.forEach(listener => listener(data.message)); return }
        if (data?.type === 'connector.event') { connectorListeners.forEach(listener => { try { listener(data.event) } catch (error) { console.error(error) } }); return }
        if (data?.type === 'save') {
          try { if (!save) throw new Error('保存回调未注册'); await save(); port.postMessage({ type: 'saved', id: data.id }) }
          catch (error) { port.postMessage({ type: 'saved', id: data.id, error: String(error) }) }
          return
        }
        if (data?.type !== 'result') return
        const call = pending.get(data.id)
        if (!call) return
        pending.delete(data.id); clearTimeout(call.timer); call.cleanup?.()
        data.error ? call.reject(new Error(data.error)) : call.resolve(data.result)
      }
      port.start()
      resolve(Object.freeze({
        viewId: initial.viewId, sessionId: initial.sessionId,
        request: (method, input, options) => request(method, input, options),
        tool: initial.tool,
        readSession: () => request('session.read', {}),
        sendMessage: text => request('session.send', { text }),
        callTool: (name, input, options) => request('tool.call', { name, input }, options),
        getState: () => state,
        setState: value => { state = value; void request('state', { value }).catch(console.error) },
        setDirty: dirty => { void request('dirty', { dirty }).catch(console.error) },
        onDidReceiveMessage: listener => { listeners.add(listener); return { dispose: () => listeners.delete(listener) } },
        onDidChangeConfiguration: listener => { configurationListeners.add(listener); return { dispose: () => configurationListeners.delete(listener) } },
        onConnectorEvent: listener => {
          connectorListeners.add(listener)
          if (connectorListeners.size === 1) void request('connector.subscribe', {}).catch(console.error)
          return { dispose: () => { connectorListeners.delete(listener); if (!connectorListeners.size) void request('connector.unsubscribe', {}).catch(console.error) } }
        },
        registerSave: handler => {
          save = handler; void request('save.register', {}).catch(console.error)
          return { dispose: () => { if (save === handler) { save = undefined; void request('save.unregister', {}).catch(console.error) } } }
        },
        ...(initial.documentPath ? { document: { path: initial.documentPath,
          read: () => request('document.read', {}), save: (content, revision) => request('document.save', { content, revision }) } } : {}),
      }))
    }
    window.addEventListener('message', connect)
  })
  function request(method, input, options) {
    if (options?.signal?.aborted) return Promise.reject(options.signal.reason)
    if (!port) return Promise.reject(new Error('扩展页面尚未连接'))
    if (pending.size >= 64) return Promise.reject(new Error('扩展页面请求过多'))
    const id = String(++sequence)
    return new Promise((resolve, reject) => {
      const cleanup = () => options?.signal?.removeEventListener('abort', abort)
      const abort = () => { if (!pending.delete(id)) return; clearTimeout(timer); cleanup(); port.postMessage({ type: 'cancel', id }); reject(options.signal.reason) }
      const timer = setTimeout(() => { pending.delete(id); cleanup(); port.postMessage({ type: 'cancel', id }); reject(new Error('扩展页面请求超时，请核对业务状态')) }, 125000)
      pending.set(id, { resolve, reject, timer, cleanup })
      options?.signal?.addEventListener('abort', abort, { once: true })
      port.postMessage({ type: 'request', id, method, input })
    })
  }
  Object.defineProperty(window, 'acquireEdenApi', { value: () => ready, writable: false })
  window.addEventListener('keydown', event => {
    if (event.isTrusted && !event.defaultPrevented && !event.isComposing && port) {
      const editing = Boolean(event.target.closest?.('input,textarea,[contenteditable="true"]'))
      const matched = keybindings.some(binding => {
        const parts = binding.toLowerCase().split('+'), key = parts.pop(), has = name => parts.includes(name)
        if (parts.some(part => !['ctrl', 'cmd', 'ctrlcmd', 'shift', 'alt'].includes(part))) return false
        const mod = has('ctrlcmd') ? event.ctrlKey || event.metaKey : event.ctrlKey === has('ctrl') && event.metaKey === has('cmd')
        return mod && event.shiftKey === has('shift') && event.altKey === has('alt') && event.key.toLowerCase() === key
          && (!editing || event.ctrlKey || event.metaKey || event.altKey)
      })
      const saving = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's' && save
      if (matched && !saving) {
        event.preventDefault()
        port.postMessage({ type: 'shortcut', key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, editing })
        return
      }
    }
    if (!event.isTrusted || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's' || !save) return
    event.preventDefault()
    Promise.resolve().then(() => save()).then(() => request('dirty', { dirty: false })).catch(error => console.error('扩展文档保存失败', error))
  })
})()
