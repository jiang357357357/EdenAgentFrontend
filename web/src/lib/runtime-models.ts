import type { JsonValue, SchemaRpcMethodMap } from '@eden/api'
type RuntimeModelCatalogInfo = SchemaRpcMethodMap['model.catalog']['result']
type RuntimeModelInfo = SchemaRpcMethodMap['model.read']['result']
import type { ModelSelectionTarget } from '@eden/api'
export type { ModelSelectionTarget } from '@eden/api'

export type RuntimeModelOption = {
  id: string
  aiEntityId: number | string
  label: string
  name: string
  provider: string
  providerName?: string
  providerIcon?: string
  supportedModels?: string[]
  modelID: string
  status: string
  isMultimodal: boolean
  contextWindow?: number
  selected: boolean
}

export type RuntimeModelConfig = {
  source: "core" | "env" | string
  serviceType?: "ai" | string
  vendors?: Record<string, unknown>
  assistant?: {
    id?: number | string
    name?: string
  }
  character?: {
    id?: number | string
    name?: string
  }
  current?: RuntimeModelOption | null
  vision?: RuntimeModelOption | null
  director?: RuntimeModelOption | null
  actors?: { assistantId: number | string; name: string; current: RuntimeModelOption | null }[]
  options: RuntimeModelOption[]
}

function readModelOption(value: unknown): RuntimeModelOption | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const option = value as Record<string, unknown>
  if (typeof option.id !== 'string' || typeof option.label !== 'string' || typeof option.provider !== 'string' || typeof option.modelID !== 'string') return null
  return { id: option.id, aiEntityId: typeof option.aiEntityId === 'number' || typeof option.aiEntityId === 'string' ? option.aiEntityId : option.id,
    label: option.label, name: typeof option.name === 'string' ? option.name : option.label,
    provider: option.provider, modelID: option.modelID, status: typeof option.status === 'string' ? option.status : '',
    isMultimodal: option.isMultimodal === true, selected: option.selected === true }
}

function modelEntityId(value: JsonValue): number | string | undefined {
  return typeof value === "number" || typeof value === "string" ? value : undefined
}

function mapRuntimeModelOption(option: RuntimeModelCatalogInfo["options"][number]): RuntimeModelOption {
  return {
    id: option.id,
    aiEntityId: modelEntityId(option.aiEntityId) ?? option.id,
    label: option.label,
    name: option.name,
    provider: option.provider,
    providerName: option.providerName,
    providerIcon: option.providerIcon,
    supportedModels: option.supportedModels,
    modelID: option.modelID,
    status: option.status,
    isMultimodal: option.isMultimodal,
    contextWindow: Number(option.contextWindow),
    selected: option.selected,
  }
}

export function mapRuntimeModelCatalog(catalog: RuntimeModelCatalogInfo): RuntimeModelConfig {
  const vendors = catalog.vendors && typeof catalog.vendors === "object" && !Array.isArray(catalog.vendors)
    ? catalog.vendors as Record<string, unknown>
    : {}
  return {
    source: catalog.source,
    serviceType: catalog.serviceType,
    vendors,
    assistant: {
      id: modelEntityId(catalog.assistant?.id ?? null),
      name: catalog.assistant?.name,
    },
    character: {
      id: modelEntityId(catalog.character?.id ?? null),
      name: catalog.character?.name,
    },
    current: catalog.current ? mapRuntimeModelOption(catalog.current) : null,
    vision: catalog.vision ? mapRuntimeModelOption(catalog.vision) : null,
    options: catalog.options.map(mapRuntimeModelOption),
    director: readModelOption('director' in catalog ? catalog.director : null),
    actors: catalog.actors.flatMap(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return []
      const id = modelEntityId(value.assistantId ?? null)
      return id === undefined ? [] : [{ assistantId: id,
        name: typeof value.assistantName === 'string' ? value.assistantName : `角色 ${id}`,
        current: readModelOption(value.main) }]
    }),
  }
}

export function mapLocalRuntimeModel(info: RuntimeModelInfo): RuntimeModelConfig {
  const aiEntityId = modelEntityId(info.aiEntityId ?? info.id) ?? info.id
  const option: RuntimeModelOption = {
    id: info.id,
    aiEntityId,
    label: info.label,
    name: info.label,
    provider: info.provider,
    providerName: info.provider,
    modelID: info.id,
    status: info.available ? "available" : "unavailable",
    isMultimodal: false,
    contextWindow: info.contextWindow == null ? undefined : Number(info.contextWindow),
    selected: true,
  }
  return {
    source: info.source,
    serviceType: "ai",
    current: option,
    vision: null,
    options: [option],
  }
}


export function modelSelection(config: RuntimeModelConfig, key: string) {
  const actors = config.actors ?? []
  const actor = actors.find(item => `actor:${item.assistantId}` === key)
  const target: ModelSelectionTarget | undefined = actors.length > 1 ?
    actor ? { kind: 'actor', assistantId: actor.assistantId } : { kind: 'director' } : undefined
  const current = target ? actor?.current ?? (actor ? null : config.director) : config.current
  return { target, key: target?.kind === 'actor' ? `actor:${target.assistantId}` : 'director',
    options: config.options.map(option => ({ ...option,
      selected: current ? String(option.aiEntityId) === String(current.aiEntityId) : target ? false : option.selected })) }
}
