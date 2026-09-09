import { useMemo } from 'react'
import type { SkillInfo, JsonValue } from '@eden/api'
import { rpcRequest as defaultRequest } from './rpc-transport'
import { useScopedRpc } from './use-scoped-rpc'

export type InstalledSkill = {
  workspaceRoot?: string
  id: string
  skillName: string
  displayName: string
  description: string
  scope: "system" | "user" | "project"
  sourceType: "builtin" | "local" | "git" | "archive" | "marketplace" | "generated"
  sourceUri?: string
  sourceRef?: string
  sourceSubpath?: string
  version?: string
  enabled: boolean
  trustStatus: "trusted" | "blocked"
  builtin: boolean
  available: boolean
  tools?: string[]
  profiles?: string[]
  permissions?: string[]
  modelInvocable?: boolean
  defaultPrompt?: string
  contentHash?: string
  totalBytes?: number
  missingTools?: string[]
  installedAt?: string
  updatedAt?: string
  shadowed?: boolean
}

export type SkillDetails = InstalledSkill & {
  content: string
  files: string[]
  manifest: Record<string, unknown>
}

export type SkillPreview = {
  previewID: string
  skillName: string
  displayName: string
  description: string
  version: string
  scope: "user" | "project"
  source: { type: "local" | "git"; uri: string; ref: string; subpath: string }
  tools: string[]
  profiles: string[]
  modelInvocable: boolean
  contentHash: string
  fileCount: number
  totalBytes: number
  expiresAt: number
  replaceInstallationID?: string | null
}

export function createSkillClient(rpcRequest: typeof defaultRequest = defaultRequest) {
async function listSkills() {
  return (await rpcRequest("skill.list", {})).map(mapSkillInfo)
}

function mapSkillInfo(skill: SkillInfo): InstalledSkill {
  const sourceType = (["builtin", "local", "git", "archive", "marketplace", "generated"] as const)
    .find((value) => value === skill.sourceType) ?? "local"
  const scope = (["system", "user", "project"] as const).find((value) => value === skill.scope) ?? "user"
  const manifest = skill.manifest && typeof skill.manifest === "object" && !Array.isArray(skill.manifest)
    ? skill.manifest as Record<string, JsonValue>
    : {}
  const source = manifest.source && typeof manifest.source === "object" && !Array.isArray(manifest.source)
    ? manifest.source as Record<string, JsonValue>
    : {}
  return {
    id: skill.name,
    workspaceRoot: typeof manifest.workspaceRoot === "string" ? manifest.workspaceRoot : "",
    skillName: skill.name,
    displayName: skill.displayName || skill.name,
    description: skill.description,
    scope,
    sourceType,
    sourceUri: typeof source.uri === "string" ? source.uri : undefined,
    sourceRef: typeof source.ref === "string" ? source.ref : undefined,
    sourceSubpath: typeof source.subpath === "string" ? source.subpath : undefined,
    version: skill.version,
    enabled: skill.enabled,
    trustStatus: "trusted",
    builtin: sourceType === "builtin",
    available: skill.available,
    tools: skill.tools,
    profiles: skill.profiles,
    permissions: skill.permissions,
    modelInvocable: skill.modelInvocable,
    defaultPrompt: skill.defaultPrompt,
    contentHash: skill.contentHash,
    totalBytes: Number(skill.totalBytes),
    missingTools: skill.missingTools,
  }
}

async function getSkillDetails(id: string, expected?: InstalledSkill) {
  const skill = await rpcRequest("skill.read", { name: id, ...(expected ? { expectedContentHash: expected.contentHash, expectedWorkspaceRoot: expected.workspaceRoot } : {}) })
  return { ...mapSkillInfo(skill), content: skill.content ?? "", files: skill.files,
    manifest: skill.manifest && typeof skill.manifest === "object" && !Array.isArray(skill.manifest)
      ? skill.manifest as Record<string, unknown> : {} } satisfies SkillDetails
}

function inspectSkill(input: {
  sourceType: "local" | "git"
  sourceUri: string
  sourceRef?: string
  sourceSubpath?: string
  scope: "user" | "project"
}) {
  return rpcRequest("skill.inspect", input).then((preview): SkillPreview => ({
    previewID: preview.previewID,
    skillName: preview.skillName,
    displayName: preview.displayName,
    description: preview.description,
    version: preview.version,
    scope: preview.scope === "project" ? "project" : "user",
    source: {
      type: preview.source.type === "git" ? "git" : "local",
      uri: preview.source.uri,
      ref: preview.source.ref,
      subpath: preview.source.subpath,
    },
    tools: preview.tools,
    profiles: preview.profiles,
    modelInvocable: preview.modelInvocable,
    contentHash: preview.contentHash,
    fileCount: Number(preview.fileCount),
    totalBytes: Number(preview.totalBytes),
    expiresAt: Number(preview.expiresAt),
  }))
}

async function installSkill(previewID: string) {
  const skill = await rpcRequest("skill.install_preview", { previewId: previewID })
  return mapSkillInfo(skill)
}

function setSkillEnabled(id: string, enabled: boolean, expected?: InstalledSkill) {
  const params = { name: id, enabled, ...(expected ? { expectedContentHash: expected.contentHash, expectedWorkspaceRoot: expected.workspaceRoot } : {}) }
  return rpcRequest("skill.enable", params).then(mapSkillInfo)
}

function uninstallSkill(id: string, expected?: InstalledSkill) {
  const params = { name: id, ...(expected ? { expectedContentHash: expected.contentHash, expectedWorkspaceRoot: expected.workspaceRoot } : {}) }
  return rpcRequest("skill.uninstall", params)
}

  return { listSkills, getSkillDetails, inspectSkill, installSkill, setSkillEnabled, uninstallSkill }
}

export const { listSkills, getSkillDetails, inspectSkill, installSkill, setSkillEnabled, uninstallSkill } = createSkillClient()

export function useSkillClient() {
  const request = useScopedRpc()
  return useMemo(() => createSkillClient(request), [request])
}
