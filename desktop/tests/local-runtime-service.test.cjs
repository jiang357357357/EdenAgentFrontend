const assert = require("node:assert/strict")
const test = require("node:test")
const { createLocalRuntimeService } = require("../src/app/local-runtime-service.cjs")

function createStore(overrides = {}) {
  const state = {
    provider: "openai",
    model: "openai/gpt-4o-mini",
    baseUrl: "https://api.openai.test/v1",
    apiKey: "stored-key",
    hasApiKey: true,
    voice: {
      provider: "gsv",
      serviceUrl: "http://127.0.0.1:40302",
      version: "v2ProPlus",
      world: "BlueArchive",
      role: "阿罗娜",
      roleId: "7",
      emotion: "平常",
      timeoutSeconds: 60,
    },
    transcription: {
      provider: "gsv",
      serviceUrl: "http://127.0.0.1:40302",
      language: "zh",
      modelType: "funasr",
      modelSize: "large",
      precision: "float32",
      timeoutSeconds: 60,
      retryCount: 3,
    },
    ...overrides,
  }
  return {
    publicConfig: () => ({ ...state }),
    read: () => ({ ...state }),
    resolve: (input) => ({ ...state, ...input, apiKey: input.apiKey?.trim() || state.apiKey }),
    save: (input) => Object.assign(state, input.apiKey ? input : { ...input, apiKey: state.apiKey }),
  }
}

test("tests the OpenAI-compatible models endpoint with the stored key", async () => {
  const requests = []
  const service = createLocalRuntimeService({
    configStore: createStore(),
    rustServer: { status: () => ({ managed: true }), restart: async () => ({ restarted: true, externallyManaged: false }) },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return { ok: true, status: 200, json: async () => ({ data: [] }) }
    },
  })
  const result = await service.testConnection({ apiKey: "" })
  assert.equal(result.ok, true)
  assert.equal(requests[0].url, "https://api.openai.test/v1/models")
  assert.equal(requests[0].options.headers.Authorization, "Bearer stored-key")
})

test("discovers GSV versions, worlds, roles, and emotions as a cascade", async () => {
  const urls = []
  const service = createLocalRuntimeService({
    configStore: createStore(),
    rustServer: { status: () => ({ managed: true }), restart: async () => ({ restarted: true, externallyManaged: false }) },
    fetchImpl: async (url) => {
      urls.push(String(url))
      const pathname = new URL(url).pathname
      if (pathname.includes("versions")) return { ok: true, status: 200, json: async () => ({ versions: ["v2ProPlus"] }) }
      if (pathname.includes("world/list")) return { ok: true, status: 200, json: async () => ({ worlds: [{ name: "BlueArchive" }] }) }
      if (pathname.includes("role/list")) return { ok: true, status: 200, json: async () => ({ roles: [{ id: 7, name: "阿罗娜" }] }) }
      return { ok: true, status: 200, json: async () => ({ emotions: ["平常", "开心"] }) }
    },
  })
  const result = await service.inspectGsv(createStore().read().voice)
  assert.equal(result.ok, true)
  assert.equal(result.roles[0].id, "7")
  assert.deepEqual(result.emotions.map((option) => option.value), ["平常", "开心"])
  assert.match(urls[1], /version=v2ProPlus/)
  assert.match(urls[2], /world_name=BlueArchive/)
  assert.match(urls[3], /role_id=7/)
})

test("loads GSV catalog, roles, and emotions only at their requested cascade stage", async () => {
  const urls = []
  const service = createLocalRuntimeService({
    configStore: createStore(),
    rustServer: { status: () => ({ managed: true }), restart: async () => ({ restarted: true, externallyManaged: false }) },
    fetchImpl: async (url) => {
      urls.push(String(url))
      const pathname = new URL(url).pathname
      if (pathname.includes("versions")) return { ok: true, status: 200, json: async () => ({ versions: ["v2ProPlus"] }) }
      if (pathname.includes("world/list")) return { ok: true, status: 200, json: async () => ({ worlds: [{ name: "BlueArchive" }] }) }
      if (pathname.includes("role/list")) return { ok: true, status: 200, json: async () => ({ roles: [{ id: 7, name: "阿罗娜" }] }) }
      return { ok: true, status: 200, json: async () => ({ emotions: ["平常"] }) }
    },
  })
  const voice = createStore().read().voice
  const catalog = await service.inspectGsv(voice, "catalog")
  assert.equal(catalog.versions.length, 1)
  assert.equal(catalog.worlds.length, 1)
  assert.equal(catalog.roles.length, 0)
  assert.equal(urls.some((url) => url.includes("role/list")), false)

  const roles = await service.inspectGsv(voice, "roles")
  assert.equal(roles.roles[0].id, "7")
  assert.equal(urls.some((url) => url.includes("role/emotions")), false)

  const emotions = await service.inspectGsv(voice, "emotions")
  assert.deepEqual(emotions.emotions.map((option) => option.value), ["平常"])
})

test("synthesizes a GSV voice preview with the selected role and current parameters", async () => {
  const requests = []
  const service = createLocalRuntimeService({
    configStore: createStore(),
    rustServer: { status: () => ({ managed: true }), restart: async () => ({ restarted: true, externallyManaged: false }) },
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options })
      const pathname = new URL(url).pathname
      if (pathname.includes("versions")) return { ok: true, status: 200, json: async () => ({ versions: ["v2ProPlus"] }) }
      if (pathname.includes("world/list")) return { ok: true, status: 200, json: async () => ({ worlds: [{ name: "BlueArchive" }] }) }
      if (pathname.includes("role/list")) return { ok: true, status: 200, json: async () => ({ roles: [{ id: 7, name: "阿罗娜" }] }) }
      if (pathname.includes("role/emotions")) return { ok: true, status: 200, json: async () => ({ emotions: ["平常"] }) }
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ success: true, audio_data: Buffer.from("wav-audio").toString("base64"), duration: 1.2 }),
      }
    },
  })
  const result = await service.previewGsv(createStore().read().voice, "老师，您好")
  assert.equal(result.ok, true)
  assert.match(result.audioDataUrl, /^data:audio\/wav;base64,/)
  const synthesis = requests.find((request) => request.url.endsWith("/api/synthesis/role-emotion"))
  const payload = JSON.parse(synthesis.options.body)
  assert.equal(payload.role_id, "7")
  assert.equal(payload.text, "老师，您好")
  assert.equal(payload.text_language, "zh")
})

test("saving GSV configuration restarts the local Rust server", async () => {
  const store = createStore()
  let restartCalls = 0
  const service = createLocalRuntimeService({
    configStore: store,
    rustServer: {
      status: () => ({ managed: true }),
      restart: async () => { restartCalls += 1; return { restarted: true, externallyManaged: false } },
    },
  })
  const result = await service.saveVoice({ ...store.read().voice, emotion: "开心" })
  assert.equal(result.voice.emotion, "开心")
  assert.equal(restartCalls, 1)
})

test("tests and saves the GSV transcription configuration", async () => {
  const store = createStore()
  const urls = []
  let restartCalls = 0
  const service = createLocalRuntimeService({
    configStore: store,
    rustServer: {
      status: () => ({ managed: true }),
      restart: async () => { restartCalls += 1; return { restarted: true, externallyManaged: false } },
    },
    fetchImpl: async (url) => {
      urls.push(String(url))
      return { ok: true, status: 200 }
    },
  })
  const tested = await service.testGsvStt(store.read().transcription)
  assert.equal(tested.ok, true)
  assert.equal(urls[0], "http://127.0.0.1:40302/health")
  const result = await service.saveTranscription({ ...store.read().transcription, language: "auto" })
  assert.equal(result.transcription.language, "auto")
  assert.equal(restartCalls, 1)
})

test("saving reports when the externally managed server needs an app restart", async () => {
  const store = createStore()
  const service = createLocalRuntimeService({
    configStore: store,
    rustServer: {
      status: () => ({ externallyManaged: true, restartSupported: false }),
      restart: async () => ({ restarted: false, externallyManaged: true }),
    },
    fetchImpl: async () => ({ ok: false }),
  })
  const result = await service.saveAndRestart({ model: "openai/gpt-4.1" })
  assert.equal(result.restartRequired, true)
  assert.equal(result.restarted, false)
  assert.equal(store.read().model, "openai/gpt-4.1")
})

test("saving does not request another restart after MonPM restarted successfully", async () => {
  const service = createLocalRuntimeService({
    configStore: createStore(),
    rustServer: {
      status: () => ({ externallyManaged: true, restartSupported: true }),
      restart: async () => ({ restarted: true, externallyManaged: true }),
    },
    fetchImpl: async () => ({ ok: true }),
  })
  const result = await service.saveAndRestart({ model: "deepseek/deepseek-chat" })
  assert.equal(result.restartRequired, false)
  assert.equal(result.restarted, true)
})

test("saving a character profile does not restart the Rust server", async () => {
  const store = createStore({ character: { name: "本地助手" } })
  let restartCalls = 0
  const service = createLocalRuntimeService({
    configStore: store,
    rustServer: {
      status: () => ({ managed: true, restartSupported: true }),
      restart: async () => { restartCalls += 1; return { restarted: true, externallyManaged: false } },
    },
    fetchImpl: async () => ({ ok: true }),
  })
  const result = await service.saveCharacter({ name: "小尘", personality: "沉稳" })
  assert.equal(result.character.name, "小尘")
  assert.equal(restartCalls, 0)
})
