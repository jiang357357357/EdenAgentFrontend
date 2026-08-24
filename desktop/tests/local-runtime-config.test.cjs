const assert = require("node:assert/strict")
const path = require("node:path")
const test = require("node:test")
const { DEFAULT_LOCAL_CHARACTER, LOCAL_RUNTIME_CONFIG_VERSION, createLocalRuntimeConfigStore, migrateStoredCharacter, normalizeCharacter, normalizeConfig, normalizeLocalGsvConfig, normalizeLocalGsvSttConfig, normalizeSpine, providerKey } = require("../src/app/local-runtime-config.cjs")

function memoryFileSystem(initial = {}) {
  const files = new Map(Object.entries(initial))
  const writes = []
  return {
    files,
    writes,
    readFileSync(filePath) {
      if (!files.has(filePath)) throw Object.assign(new Error("missing"), { code: "ENOENT" })
      return files.get(filePath)
    },
    mkdirSync() {},
    writeFileSync(filePath, contents, options) {
      files.set(filePath, contents)
      writes.push({ filePath, contents, options })
    },
    chmodSync(filePath, mode) { writes.push({ filePath, mode }) },
  }
}

test("normalizes model identifiers and validates the compatible endpoint", () => {
  assert.deepEqual(normalizeConfig({ provider: "deepseek", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1/" }), {
    provider: "deepseek",
    model: "deepseek/deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsImages: true,
    timeoutSeconds: 90,
    maxRetries: 2,
  })
  assert.throws(() => normalizeConfig({ provider: "openai", baseUrl: "file:///secret" }), /只支持 http 或 https/)
  assert.equal(providerKey("open-router"), "OPEN_ROUTER_API_KEY")
})

test("normalizes and exports the local GSV synthesis configuration", () => {
  const voice = normalizeLocalGsvConfig({
    serviceUrl: "http://127.0.0.1:40302/",
    role: " 阿罗娜 ",
    roleId: "42",
    speed: 9,
    topP: -1,
  })
  assert.equal(voice.serviceUrl, "http://127.0.0.1:40302")
  assert.equal(voice.role, "阿罗娜")
  assert.equal(voice.roleId, "42")
  assert.equal(voice.speed, 2)
  assert.equal(voice.topP, 0)

  const store = createLocalRuntimeConfigStore({
    app: { isPackaged: false, getPath: () => "/user" },
    agentRoot: "/agent",
    fileSystem: memoryFileSystem(),
    pathApi: path.posix,
  })
  store.save({ voice })
  const environment = store.environment({})
  assert.equal(environment.EDEN_AGENT_TTS_SERVICE_URL, "http://127.0.0.1:40302")
  assert.equal(environment.EDEN_AGENT_TTS_ROLE, "阿罗娜")
  assert.equal(environment.EDEN_AGENT_TTS_ROLE_ID, "42")
})

test("normalizes and exports the complete local GSV transcription configuration", () => {
  const transcription = normalizeLocalGsvSttConfig({
    serviceUrl: "http://127.0.0.1:40302/",
    language: "auto",
    modelType: " funasr ",
    precision: "float16",
    retryCount: 99,
    endSilenceMs: 1,
    speechNoiseThreshold: 4,
  })
  assert.equal(transcription.serviceUrl, "http://127.0.0.1:40302")
  assert.equal(transcription.language, "auto")
  assert.equal(transcription.modelType, "funasr")
  assert.equal(transcription.precision, "float16")
  assert.equal(transcription.retryCount, 10)
  assert.equal(transcription.endSilenceMs, 300)
  assert.equal(transcription.speechNoiseThreshold, 1)

  const store = createLocalRuntimeConfigStore({
    app: { isPackaged: false, getPath: () => "/user" },
    agentRoot: "/agent",
    fileSystem: memoryFileSystem(),
    pathApi: path.posix,
  })
  store.save({ transcription })
  const environment = store.environment({})
  assert.equal(environment.EDEN_AGENT_STT_SERVICE_URL, "http://127.0.0.1:40302")
  assert.equal(environment.EDEN_AGENT_STT_MODEL_TYPE, "funasr")
  assert.equal(environment.EDEN_AGENT_STT_END_SILENCE_MS, "300")
  assert.equal(environment.EDEN_AGENT_STT_AUTO_FINISH, "true")
})

test("normalizes the local character profile with bounded text", () => {
  const character = normalizeCharacter({
    name: "  小尘  ",
    aliases: "尘尘，小助手\n尘尘",
    personality: "安静",
    userAddress: "老师",
    initiativeLevel: "proactive",
    responseLength: "detailed",
    systemPrompt: "保持简洁",
  })
  assert.equal(character.name, "小尘")
  assert.deepEqual(character.aliases, ["尘尘", "小助手"])
  assert.equal(character.personality, "安静")
  assert.equal(character.userAddress, "老师")
  assert.equal(character.initiativeLevel, "proactive")
  assert.equal(character.responseLength, "detailed")
  assert.equal(character.systemPrompt, "保持简洁")
  assert.equal(character.visualPreference, "static")
  assert.equal(character.spine, null)
})

test("the local character schema retains every dossier category", () => {
  const character = normalizeCharacter({
    background: "背景",
    appearance: "外貌",
    worldNames: ["尘世"],
    values: "价值观",
    userRelationship: "伙伴",
    relationshipBoundaries: "尊重隐私",
    goals: "长期目标",
    decisionPrinciples: "先核实",
    memoryPreferences: "记住确认过的偏好",
    behavioralRules: "诚实说明结果",
    speechStyle: "自然简洁",
    exampleDialogue: "用户：你好\n角色：你好。",
    voiceStyle: "平稳",
  })
  for (const key of [
    "background", "appearance", "worldNames", "values", "userRelationship",
    "relationshipBoundaries", "goals", "decisionPrinciples", "memoryPreferences",
    "behavioralRules", "speechStyle", "exampleDialogue", "voiceStyle",
  ]) assert.ok(Object.hasOwn(character, key), `missing ${key}`)
  assert.deepEqual(character.worldNames, ["尘世"])
})

test("ships a complete Arona profile as the local character default", () => {
  assert.equal(DEFAULT_LOCAL_CHARACTER.name, "阿罗娜")
  assert.deepEqual(DEFAULT_LOCAL_CHARACTER.worldNames, ["基沃托斯", "什亭之匣", "夏莱"])
  assert.match(DEFAULT_LOCAL_CHARACTER.occupation, /系统管理员与主 OS/)
  assert.match(DEFAULT_LOCAL_CHARACTER.personality, /活泼开朗/)
  assert.match(DEFAULT_LOCAL_CHARACTER.likes, /卡斯特拉、草莓牛奶/)
  assert.equal(DEFAULT_LOCAL_CHARACTER.userAddress, "老师")
  assert.equal(DEFAULT_LOCAL_CHARACTER.initiativeLevel, "proactive")
  assert.match(DEFAULT_LOCAL_CHARACTER.behavioralRules, /已知事实、合理推断和未知内容/)
  assert.match(DEFAULT_LOCAL_CHARACTER.systemPrompt, /你是阿罗娜/)
  assert.equal(DEFAULT_LOCAL_CHARACTER.avatarPath, "")
  assert.equal(DEFAULT_LOCAL_CHARACTER.standingImagePath, "")
  assert.equal(DEFAULT_LOCAL_CHARACTER.visualPreference, "static")
  assert.equal(DEFAULT_LOCAL_CHARACTER.spine, null)
})

test("normalizes a complete Spine profile and rejects incomplete resources", () => {
  assert.equal(normalizeSpine({ skeletonPath: "/role/a.skel", atlasPath: "/role/a.atlas", textures: [] }), null)
  assert.deepEqual(normalizeSpine({
    directory: "/role",
    skeletonPath: "/role/a.skel",
    atlasPath: "/role/a.atlas",
    textures: [{ pageName: " a.png ", filePath: " /role/a.png " }],
    runtimeVersion: "4.2.1",
    defaultSkin: "default",
    idleAnimation: "Idle",
    layout: "standee",
    scale: 50,
    offsetX: -20_000,
    offsetY: 12,
  }), {
    directory: "/role",
    skeletonPath: "/role/a.skel",
    atlasPath: "/role/a.atlas",
    textures: [{ pageName: "a.png", filePath: "/role/a.png" }],
    runtimeVersion: "4.2.1",
    defaultSkin: "default",
    idleAnimation: "Idle",
    layout: "standee",
    scale: 10,
    offsetX: -10_000,
    offsetY: 12,
  })
})

test("stores the API key in a private file and returns it to the configuration page", () => {
  const filePath = path.posix.join("/agent", "Data", "local-runtime.json")
  const fileSystem = memoryFileSystem()
  const store = createLocalRuntimeConfigStore({
    app: { isPackaged: false, getPath: () => "/user" },
    agentRoot: "/agent",
    fileSystem,
    pathApi: path.posix,
  })
  const saved = store.save({ provider: "ollama", model: "qwen3", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "local-secret" })
  assert.equal(saved.apiKey, "local-secret")
  assert.equal(fileSystem.writes[0].filePath, filePath)
  assert.equal(fileSystem.writes[0].options.mode, 0o600)
  const projected = store.publicConfig({})
  assert.equal(projected.hasApiKey, true)
  assert.equal(projected.apiKey, "local-secret")
  assert.equal(store.environment({}).OLLAMA_API_KEY, "local-secret")
  assert.equal(projected.character.name, "阿罗娜")
  assert.equal(projected.character.userAddress, "老师")
})

test("migrates the untouched legacy default to Arona without discarding visual resources", () => {
  const filePath = "/agent/Data/local-runtime.json"
  const fileSystem = memoryFileSystem({
    [filePath]: JSON.stringify({
      version: 2,
      provider: "openai",
      model: "openai/gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      character: {
        name: "本地助手",
        description: "运行于本地 Eden Agent Server 的默认助手。",
        initiativeLevel: "balanced",
        responseLength: "balanced",
        formality: "balanced",
        emojiUsage: "low",
        languagePreference: "中文",
        avatarPath: "/role/arona.png",
      },
    }),
  })
  const store = createLocalRuntimeConfigStore({ app: { isPackaged: false, getPath: () => "/user" }, agentRoot: "/agent", fileSystem, pathApi: path.posix })
  const migrated = store.read({}).character
  assert.equal(migrated.name, "阿罗娜")
  assert.equal(migrated.avatarPath, "/role/arona.png")
  assert.equal(migrated.initiativeLevel, "proactive")
  assert.equal(migrated.visualPreference, "static")
  assert.equal(migrated.spine, null)
  assert.match(migrated.personality, /活泼开朗/)

  store.save({ character: migrated })
  assert.equal(JSON.parse(fileSystem.files.get(filePath)).version, LOCAL_RUNTIME_CONFIG_VERSION)
})

test("removes obsolete bundled Arona paths from the previous profile version", () => {
  const migrated = migrateStoredCharacter({
    name: "阿罗娜",
    personality: "自定义但仍是阿罗娜",
    avatarPath: "./characters/arona/avatar.png",
    standingImagePath: "./characters/arona/standing.png",
    spine: {
      directory: "./characters/arona/spine",
      skeletonPath: "./characters/arona/spine/arona_spr.skel",
      atlasPath: "./characters/arona/spine/arona_spr.atlas",
      textures: [{ pageName: "arona_spr.png", filePath: "./characters/arona/spine/arona_spr.png" }],
    },
    visualPreference: "spine",
  }, 4)
  assert.equal(migrated.personality, "自定义但仍是阿罗娜")
  assert.equal(migrated.avatarPath, "")
  assert.equal(migrated.standingImagePath, "")
  assert.equal(migrated.visualPreference, "static")
  assert.equal(migrated.spine, null)
})

test("model updates preserve the local character profile", () => {
  const filePath = "/agent/Data/local-runtime.json"
  const fileSystem = memoryFileSystem({
    [filePath]: JSON.stringify({ provider: "openai", model: "openai/gpt-4o-mini", baseUrl: "https://api.openai.com/v1", apiKey: "saved", character: { name: "小尘", personality: "沉稳" } }),
  })
  const store = createLocalRuntimeConfigStore({ app: { isPackaged: false, getPath: () => "/user" }, agentRoot: "/agent", fileSystem, pathApi: path.posix })
  store.save({ model: "openai/gpt-4.1" })
  assert.equal(store.read({}).character.name, "小尘")
  assert.equal(store.read({}).character.personality, "沉稳")
  assert.equal(store.read({}).character.description, "")
})

test("an empty API key preserves the existing secret", () => {
  const filePath = "/agent/Data/local-runtime.json"
  const fileSystem = memoryFileSystem({
    [filePath]: JSON.stringify({ provider: "openai", model: "openai/gpt-4o-mini", baseUrl: "https://api.openai.com/v1", apiKey: "saved" }),
  })
  const store = createLocalRuntimeConfigStore({
    app: { isPackaged: false, getPath: () => "/user" },
    agentRoot: "/agent",
    fileSystem,
    pathApi: path.posix,
  })
  store.save({ provider: "openai", model: "openai/gpt-4.1", baseUrl: "https://api.openai.com/v1", apiKey: "" })
  assert.equal(store.read({}).apiKey, "saved")
})

test("changing providers never reuses the previous provider secret", () => {
  const filePath = "/agent/Data/local-runtime.json"
  const fileSystem = memoryFileSystem({
    [filePath]: JSON.stringify({ provider: "openai", model: "openai/gpt-4o-mini", baseUrl: "https://api.openai.com/v1", apiKey: "openai-secret" }),
  })
  const store = createLocalRuntimeConfigStore({
    app: { isPackaged: false, getPath: () => "/user" },
    agentRoot: "/agent",
    fileSystem,
    pathApi: path.posix,
  })
  assert.equal(store.resolve({ provider: "deepseek", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1", apiKey: "" }, {}).apiKey, "")
  store.save({ provider: "deepseek", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1", apiKey: "" })
  assert.equal(store.read({}).apiKey, "")
})
