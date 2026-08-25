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

test("model changes target only the local realm process", async () => {
  const calls = []
  const service = createLocalRuntimeService({
    configStore: createStore(),
    rustServer: {
      status: (origin) => ({ origin, managed: true, restartSupported: true }),
      restart: async (origin) => {
        calls.push(origin)
        return { restarted: true, externallyManaged: false, origin }
      },
    },
    fetchImpl: async () => ({ ok: true }),
  })
  const result = await service.saveAndRestart({ model: "ollama/qwen3" })
  assert.deepEqual(calls, ["local"])
  assert.equal(result.server.origin, "local")
})
