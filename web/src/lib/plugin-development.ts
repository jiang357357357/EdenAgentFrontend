import { pluginDiffResultSchema, pluginLogPageSchema } from '@eden/api'
import { useMemo } from 'react'
import { useScopedRpc } from './use-scoped-rpc'
import type { PluginDraftContent } from '@eden/api'
export type { PluginDraftSummary, PluginDraftContent, PluginVersionSummary } from '@eden/api'
export function usePluginDevelopment() {
  const rpcRequest = useScopedRpc()
  return useMemo(() => ({
  describe: () => rpcRequest('plugin.describe', {}),
  diff: async (id: string, fromRevision: string, toRevision: string) => pluginDiffResultSchema.parse(await rpcRequest('plugin.version.diff', { id, fromRevision, toRevision })),
  logs: async (id: string, before?: number) => pluginLogPageSchema.parse(await rpcRequest('plugin.operation.list', { id, limit: 30, ...(before === undefined ? {} : { before }) })),
  drafts: () => rpcRequest('plugin.draft.list', {}),
  read: (id: string) => rpcRequest('plugin.draft.read', { id }),
  save: (draft: PluginDraftContent & { expectedDraftRevision?: string | null }) => rpcRequest('plugin.draft.save', { manifest: draft.manifest, source: draft.source, ...(draft.expectedDraftRevision === undefined ? {} : { expectedDraftRevision: draft.expectedDraftRevision }) }),
  validate: (id: string, expectedDraftRevision: string) => rpcRequest('plugin.validate', { id, expectedDraftRevision }),
  test: (id: string, expectedDraftRevision: string) => rpcRequest('plugin.test', { id, expectedDraftRevision }),
  install: (id: string, revision: string) => rpcRequest('plugin.install', { id, revision }),
  versions: () => rpcRequest('plugin.version.list', {}),
  version: (id: string, revision: string) => rpcRequest('plugin.version.read', { id, revision }),
  grant: (id: string, revision: string, readRoot: string) => rpcRequest('plugin.grant', { id, revision, readRoot, allowed: true }),
  activate: (id: string, revision: string, readRoot?: string) => rpcRequest('plugin.version.activate', { id, revision, ...(readRoot ? { readRoot } : {}) }),
  }), [rpcRequest])
}
