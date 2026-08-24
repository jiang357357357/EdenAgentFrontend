function errorMessage(value, fallback) {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value && typeof value === "object") {
    if (typeof value.message === "string" && value.message.trim()) return value.message.trim()
    if (typeof value.detail === "string" && value.detail.trim()) return value.detail.trim()
    if (value.error) return errorMessage(value.error, fallback)
  }
  return fallback
}

function gsvLanguageCode(language) {
  return {
    中文: "zh",
    英文: "en",
    日文: "ja",
    粤语: "yue",
    韩文: "ko",
    中英混合: "auto",
    日英混合: "auto",
    粤英混合: "auto_yue",
    韩英混合: "auto",
    多语种混合: "auto",
    "多语种混合(粤语)": "auto_yue",
  }[language] || language || "zh"
}

async function responseError(response) {
  try {
    return errorMessage(await response.json(), `模型服务返回 HTTP ${response.status}`)
  } catch {
    return `模型服务返回 HTTP ${response.status}`
  }
}

function createLocalRuntimeService({ configStore, rustServer, fetchImpl = globalThis.fetch, serverHealthUrl = "http://127.0.0.1:40092/healthz" } = {}) {
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
        ...rustServer.status(),
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

  async function inspectGsv(input = {}, stage = "all") {
    if (!["all", "catalog", "worlds", "roles", "emotions"].includes(stage)) {
      throw new Error(`未知的 GSV 读取阶段：${stage}`)
    }
    const voice = configStore.resolve({ voice: input }).voice
    const baseUrl = String(voice.serviceUrl || "").replace(/\/+$/, "")
    const startedAt = Date.now()
    const requestJson = async (pathname, query = {}) => {
      const endpoint = new URL(`${baseUrl}${pathname}`)
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && String(value)) endpoint.searchParams.set(key, String(value))
      }
      let response
      try {
        response = await fetchImpl(endpoint, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(Math.min(12_000, voice.timeoutSeconds * 1000)),
        })
      } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error("连接 GSV 服务超时")
        throw new Error(`无法连接 GSV 服务：${errorMessage(error, "网络错误")}`)
      }
      if (!response.ok) throw new Error(`GSV 服务返回 HTTP ${response.status}`)
      try {
        return await response.json()
      } catch {
        throw new Error("GSV 服务返回了无效的 JSON 数据")
      }
    }
    const asOptions = (value, keys) => {
      const list = keys.reduce((current, key) => current ?? value?.[key], undefined)
      if (!Array.isArray(list)) return []
      return list.flatMap((item) => {
        if (typeof item === "string" && item.trim()) return [{ id: "", label: item.trim(), value: item.trim() }]
        if (!item || typeof item !== "object") return []
        const optionValue = String(item.name ?? item.value ?? item.label ?? "").trim()
        if (!optionValue) return []
        return [{ id: item.id == null ? "" : String(item.id), label: String(item.label ?? item.name ?? optionValue), value: optionValue }]
      })
    }

    let versions = []
    let worlds = []
    let roles = []
    let emotions = []
    let version = voice.version || ""
    let world = voice.world || ""
    let role = voice.roleId ? { id: voice.roleId, value: voice.role, label: voice.role } : null

    if (stage === "all" || stage === "catalog") {
      const versionsPayload = await requestJson("/api/models/versions/from-enum/")
      versions = asOptions(versionsPayload, ["versions"])
      version = versions.some((option) => option.value === voice.version)
        ? voice.version
        : versions[0]?.value || voice.version || ""
    }
    if (stage === "all" || stage === "catalog" || stage === "worlds") {
      const worldsPayload = version ? await requestJson("/api/world/list/", { version }) : {}
      worlds = asOptions(worldsPayload, ["worlds"])
      world = worlds.some((option) => option.value === voice.world)
        ? voice.world
        : worlds[0]?.value || voice.world || ""
    }
    if (stage === "all" || stage === "roles" || (stage === "emotions" && !role?.id)) {
      const rolesPayload = version && world
        ? await requestJson("/api/role/list/", { version, world_name: world })
        : {}
      roles = asOptions(rolesPayload, ["roles"])
      role = roles.find((option) => option.id === voice.roleId)
        ?? roles.find((option) => option.value === voice.role)
        ?? roles[0]
    }
    if (stage === "all" || stage === "emotions") {
      const emotionsPayload = role?.id
        ? await requestJson("/api/role/emotions/", { role_id: role.id })
        : {}
      emotions = asOptions(emotionsPayload, ["emotions"])
    }
    return {
      ok: true,
      latencyMs: Math.max(0, Date.now() - startedAt),
      versions,
      worlds,
      roles,
      emotions,
      selectedRoleId: role?.id || "",
    }
  }

  async function previewGsv(input = {}, previewText = "") {
    const voice = configStore.resolve({ voice: input }).voice
    const text = String(previewText || "").trim()
    if (!text) throw new Error("请输入试听文本")
    if (text.length > 500) throw new Error("试听文本不能超过 500 个字符")
    const discovery = await inspectGsv(voice)
    const roleId = voice.roleId || discovery.selectedRoleId
    if (!roleId) throw new Error(`GSV 未找到角色“${voice.role}”`)
    const endpoint = new URL(`${String(voice.serviceUrl).replace(/\/+$/, "")}/api/synthesis/role-emotion`)
    const startedAt = Date.now()
    let response
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { Accept: "audio/wav, application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          role_id: roleId,
          emotion: voice.emotion,
          text,
          text_language: gsvLanguageCode(voice.textLanguage),
          version: voice.version,
          speed: voice.speed,
          top_k: voice.topK,
          top_p: voice.topP,
          temperature: voice.temperature,
          sample_steps: voice.sampleSteps,
          how_to_cut: voice.cutMethod,
          pause_second: voice.pauseSeconds,
          return_base64: true,
          if_sr: voice.superResolution,
          ref_free: voice.referenceFree,
          if_freeze: voice.freeze,
        }),
        signal: AbortSignal.timeout(voice.timeoutSeconds * 1000),
      })
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error("GSV 试听合成超时")
      throw new Error(`无法连接 GSV 合成服务：${errorMessage(error, "网络错误")}`)
    }
    const contentType = response.headers?.get?.("content-type")?.split(";", 1)[0]?.trim() || "audio/wav"
    let mime = contentType
    let encoded = ""
    let duration = null
    if (contentType === "application/json") {
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload || payload.success === false) {
        throw new Error(errorMessage(payload, `GSV 合成服务返回 HTTP ${response.status}`))
      }
      encoded = String(payload.audio_data || "").replace(/^data:[^,]+,/, "")
      duration = Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : null
      const format = String(payload.audio_format || "wav").replace(/^audio\//, "")
      mime = `audio/${format}`
    } else {
      const bytes = Buffer.from(await response.arrayBuffer())
      if (!response.ok) throw new Error(`GSV 合成服务返回 HTTP ${response.status}`)
      encoded = bytes.toString("base64")
    }
    if (!encoded) throw new Error("GSV 合成成功但没有返回音频数据")
    if (Buffer.byteLength(encoded, "base64") > 32 * 1024 * 1024) throw new Error("GSV 试听音频超过 32 MiB 限制")
    return {
      ok: true,
      audioDataUrl: `data:${mime};base64,${encoded}`,
      mime,
      duration,
      latencyMs: Math.max(0, Date.now() - startedAt),
      roleId,
    }
  }

  async function testGsvStt(input = {}) {
    const transcription = configStore.resolve({ transcription: input }).transcription
    const baseUrl = String(transcription.serviceUrl || "").replace(/\/+$/, "")
    let endpoint
    try {
      endpoint = new URL(`${baseUrl}/health`)
      if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") throw new Error()
    } catch {
      throw new Error("GSV 转录服务地址格式不正确")
    }
    const startedAt = Date.now()
    let response
    try {
      response = await fetchImpl(endpoint, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(Math.min(12_000, transcription.timeoutSeconds * 1000)),
      })
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error("连接 GSV 转录服务超时")
      throw new Error(`无法连接 GSV 转录服务：${errorMessage(error, "网络错误")}`)
    }
    if (!response.ok) throw new Error(`GSV 转录服务返回 HTTP ${response.status}`)
    return { ok: true, latencyMs: Math.max(0, Date.now() - startedAt) }
  }

  async function saveAndRestart(input = {}) {
    configStore.save(input)
    const restart = await rustServer.restart()
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

  async function saveVoice(voice = {}) {
    configStore.save({ voice })
    const restart = await rustServer.restart()
    return {
      ...(await read()),
      restarted: restart.restarted,
      restartRequired: restart.externallyManaged && !restart.restarted,
    }
  }

  async function saveTranscription(transcription = {}) {
    configStore.save({ transcription })
    const restart = await rustServer.restart()
    return {
      ...(await read()),
      restarted: restart.restarted,
      restartRequired: restart.externallyManaged && !restart.restarted,
    }
  }

  return { inspectGsv, previewGsv, read, saveAndRestart, saveCharacter, saveTranscription, saveVoice, serverOnline, testConnection, testGsvStt }
}

module.exports = { createLocalRuntimeService, errorMessage, gsvLanguageCode }
