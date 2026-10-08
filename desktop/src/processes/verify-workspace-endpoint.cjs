/** Verify before handing credentials to a renderer; a port is not an installation identity. */
async function verifyWorkspaceEndpoint(access, { fetchRequest = fetch, timeoutMs = 10000 } = {}) {
  if (!access.workspaceId) return access
  const deadline = Date.now() + timeoutMs
  let failure
  do {
    try {
      const response = await fetchRequest(`${access.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(Math.max(1, Math.min(1500, deadline - Date.now()))),
      })
      const health = await response.json()
      if (health.workspaceId !== access.workspaceId || health.runtimeOrigin !== access.origin)
        throw new Error('服务属于其他 EDEN 工作区；源码服务优先，请使用源码客户端或先停止源码服务')
      return access
    } catch (error) {
      if (error.message.includes('其他 EDEN 工作区')) throw error
      failure = error
    }
    if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
  } while (Date.now() < deadline)
  throw new Error(`无法连接本工作区 Agent 服务（${access.baseUrl}）：${failure?.message || '等待超时'}`)
}
module.exports = { verifyWorkspaceEndpoint }
