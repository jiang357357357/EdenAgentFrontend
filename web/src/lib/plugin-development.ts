import { pluginDiffResultSchema, pluginLogPageSchema } from '@eden/api'
import { rpcRequest } from './rpc-transport'
import type { PluginDraftContent } from '@eden/api'
export type { PluginDraftSummary, PluginDraftContent, PluginVersionSummary } from '@eden/api'
export const pluginDevelopment = {
  diff: async (id: string, fromRevision: string, toRevision: string) => pluginDiffResultSchema.parse(await rpcRequest('plugin.version.diff', { id, fromRevision, toRevision })),
  logs: async (id: string, before?: number) => pluginLogPageSchema.parse(await rpcRequest('plugin.operation.list', { id, limit: 30, ...(before === undefined ? {} : { before }) })),
  drafts: () => rpcRequest('plugin.draft.list', {}),
  read: (id: string) => rpcRequest('plugin.draft.read', { id }),
  save: (draft: PluginDraftContent) => rpcRequest('plugin.draft.save', draft),
  validate: (id: string) => rpcRequest('plugin.validate', { id }),
  test: (id: string) => rpcRequest('plugin.test', { id }),
  install: (id: string, revision: string) => rpcRequest('plugin.install', { id, revision }),
  versions: () => rpcRequest('plugin.version.list', {}),
  version: (id: string, revision: string) => rpcRequest('plugin.version.read', { id, revision }),
  grant: (id: string, revision: string, readRoot: string) => rpcRequest('plugin.grant', { id, revision, readRoot, allowed: true }),
  activate: (id: string, revision: string, readRoot?: string) => rpcRequest('plugin.version.activate', { id, revision, ...(readRoot ? { readRoot } : {}) }),
}
