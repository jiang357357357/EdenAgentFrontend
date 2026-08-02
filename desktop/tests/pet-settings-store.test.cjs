const assert = require("node:assert/strict")
const test = require("node:test")

const { createPetSettingsStore } = require("../src/pet/pet-settings-store.cjs")

test("pet settings store normalizes persisted values", () => {
  const defaults = { enabled: true, scale: 100 }
  const store = createPetSettingsStore({
    filePath: "C:\\Mon\\pet.json",
    defaults,
    normalize: (value) => ({ ...value, scale: Math.min(Number(value.scale), 140) }),
    fileSystem: { readFileSync: () => '{"scale":200}' },
  })

  assert.deepEqual(store.read(), { enabled: true, scale: 140 })
})

test("pet settings store falls back to a fresh defaults object", () => {
  const defaults = { enabled: true }
  const store = createPetSettingsStore({
    filePath: "C:\\Mon\\pet.json",
    defaults,
    normalize: (value) => value,
    fileSystem: { readFileSync: () => { throw new Error("missing") } },
  })

  const result = store.read()
  assert.deepEqual(result, defaults)
  assert.notEqual(result, defaults)
})

test("pet settings store creates the parent directory before writing", () => {
  const calls = []
  const store = createPetSettingsStore({
    filePath: "C:\\Mon\\state\\pet.json",
    defaults: {},
    normalize: (value) => value,
    fileSystem: {
      mkdirSync(target, options) { calls.push(["mkdir", target, options]) },
      writeFileSync(target, contents, encoding) { calls.push(["write", target, contents, encoding]) },
    },
    pathApi: { dirname: () => "C:\\Mon\\state" },
  })

  store.write({ scale: 100 })
  assert.deepEqual(calls[0], ["mkdir", "C:\\Mon\\state", { recursive: true }])
  assert.deepEqual(calls[1], ["write", "C:\\Mon\\state\\pet.json", '{\n  "scale": 100\n}', "utf8"])
})
