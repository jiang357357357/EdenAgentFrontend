function errorMessage(value, fallback) {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value && typeof value === "object") {
    if (typeof value.message === "string" && value.message.trim()) return value.message.trim()
    if (typeof value.detail === "string" && value.detail.trim()) return value.detail.trim()
    if (value.error) return errorMessage(value.error, fallback)
  }
  return fallback
}


async function responseError(response) {
  try {
    return errorMessage(await response.json(), `模型服务返回 HTTP ${response.status}`)
  } catch {
    return `模型服务返回 HTTP ${response.status}`
  }
}

function createLocalRuntimeService({ configStore, rustServer, fetchImpl = globalThis.fetch, serverHealthUrl = "http://127.0.0.1:40093/healthz" } = {}) {
  if (!configStore || !rustServer) throw new TypeError("configStore and rustServer are required")

  async function serverOnline() {
    try {
      const response = await fetchImpl(serverHealthUrl, { signal: AbortSignal.timeout(1500) })
      return response.ok
    } catch {
      return false
    }
  }

  async function read() {
    return {
      ...configStore.publicConfig(),
      server: {
        ...rustServer.status("local"),
        online: await serverOnline(),
      },
    }
  }

  async function testConnection(input = {}) {
    const candidate = configStore.resolve(input)
    const baseUrl = String(candidate.baseUrl || "").replace(/\/+$/, "")
    const apiKey = String(candidate.apiKey || "").trim()
    if (!baseUrl) throw new Error("请输入 API 地址")
    if (!apiKey) throw new Error("请输入 API Key")
    let endpoint
    try {
      const parsed = new URL(`${baseUrl}/models`)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error()
      endpoint = parsed.toString()
    } catch {
      throw new Error("API 地址格式不正确")
    }
    const startedAt = Date.now()
    let response
    try {
      response = await fetchImpl(endpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      })
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error("连接模型服务超时")
      throw new Error(`无法连接模型服务：${errorMessage(error, "网络错误")}`)
    }
    if (!response.ok) throw new Error(await responseError(response))
    return { ok: true, latencyMs: Math.max(0, Date.now() - startedAt) }
  }


  async function saveAndRestart(input = {}) {
    configStore.save(input)
    const restart = await rustServer.restart("local")
    return {
      ...(await read()),
      restarted: restart.restarted,
      restartRequired: restart.externallyManaged && !restart.restarted,
    }
  }

  async function saveCharacter(character = {}) {
    configStore.save({ character })
    return read()
  }


  return { read, saveAndRestart, saveCharacter, serverOnline, testConnection }
}

module.exports = { createLocalRuntimeService, errorMessage }
