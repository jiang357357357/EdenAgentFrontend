import { useCallback } from 'react'
import type { PluginUiCallOptions, PluginUiHost, PluginUiTool } from '@eden/plugin-sdk/ui'
import type { JsonValue, PluginUiCall } from '@eden/api'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import { legacyFrameDocument } from '../../lib/extensions/legacy-frame-document'
import { ExtensionFrame } from './ExtensionFrame'

export default function LegacyFrame(props: { view: PluginUiLoadedView; host: PluginUiHost; tool?: PluginUiTool;
  call(action: PluginUiCall['action'], input: Record<string, JsonValue>, options?: PluginUiCallOptions): Promise<JsonValue> }) {
  const document = useCallback((theme: Record<string, string>) => legacyFrameDocument(props.view, theme), [props.view])
  return <ExtensionFrame {...props} legacyDocument={document} />
}
