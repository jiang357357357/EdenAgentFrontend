import { getStoredToken, resolveCoreBaseUrl } from './auth'
import { getStoredRuntimeOrigin, type RuntimeOrigin } from './runtime-origin'
import { rpcRequestForOrigin } from './rpc-transport'
import { mapLocalRuntimeModel, mapRuntimeModelCatalog, type ModelSelectionTarget, type RuntimeModelConfig } from './runtime-models'

function assertOrigin(origin: RuntimeOrigin) {
  if ((getStoredRuntimeOrigin() ?? 'mon') !== origin) throw new Error('World changed while loading model configuration')
}

async function coreConnection(origin: RuntimeOrigin) {
  assertOrigin(origin)
  const coreToken = getStoredToken()
  if (!coreToken) throw new Error('not_authenticated: Core token missing')
  const coreBaseUrl = await resolveCoreBaseUrl()
  assertOrigin(origin)
  if (getStoredToken() !== coreToken) throw new Error('Core account changed; reload model configuration')
  return { coreToken, coreBaseUrl }
}

export async function getRuntimeModelConfig(sessionId?: string, origin: RuntimeOrigin = getStoredRuntimeOrigin() ?? 'mon') {
  assertOrigin(origin)
  if (origin === 'local') return mapLocalRuntimeModel(await rpcRequestForOrigin(origin, 'model.read', sessionId ? { sessionId } : {}))
  const connection = await coreConnection(origin)
  const result = await rpcRequestForOrigin(origin, 'model.catalog', { ...connection, ...(sessionId ? { sessionId } : {}) })
  if (getStoredToken() !== connection.coreToken) throw new Error('Core account changed while loading model configuration')
  return mapRuntimeModelCatalog(result)
}

export async function updateRuntimeModel(aiEntityId: number | string, sessionId?: string, target?: ModelSelectionTarget): Promise<RuntimeModelConfig> {
  const origin = getStoredRuntimeOrigin() ?? 'mon'
  if (origin === 'local') {
    const config = await getRuntimeModelConfig(sessionId, origin)
    if (String(config.current?.aiEntityId) !== String(aiEntityId)) throw new Error('本地模式不通过 Core 模型目录切换模型，请修改本地宿主模型配置。')
    return config
  }
  const connection = await coreConnection(origin)
  const result = await rpcRequestForOrigin(origin, 'model.select', { ...connection, aiEntityId,
    ...(sessionId ? { sessionId } : {}), ...(target ? { target } : {}) })
  if (getStoredToken() !== connection.coreToken) throw new Error('Core account changed; the model selection may have completed for the previous account. Reload before making another selection.')
  return mapRuntimeModelCatalog(result)
}
