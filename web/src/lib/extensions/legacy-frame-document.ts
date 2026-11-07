import runtime from './legacy-frame-runtime.ts?frame-runtime'
import type { PluginUiTool } from '@eden/plugin-sdk/ui'
import type { PluginUiLoadedView } from '../plugin-ui-runtime'
import { webviewDocument } from './webview-document'

export function legacyFrameDocument(view: PluginUiLoadedView, theme: Record<string, string>, tool?: PluginUiTool) {
  const input = JSON.stringify({ source: view.legacySource, viewId: view.view.id,
    views: view.module.document.views.map(item => item.id), tool }).replaceAll('<', '\\u003c')
  const script = `${runtime}\nEdenLegacyFrame.mount(${input}).catch(console.error);`.replace(/<\/script/gi, '<\\/script')
  return webviewDocument(`<div id="legacy-root"></div><script>${script}</script>`, theme)
}
