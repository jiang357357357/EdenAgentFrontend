const assert = require("node:assert/strict")
const path = require("node:path")
const test = require("node:test")

const { atlasPageNames, inspectSpineDirectory, pairSpineFiles } = require("../src/app/local-character-assets.cjs")

test("reads every texture page from a Spine atlas", () => {
  const atlas = `hero.png\nsize: 1024,1024\nfilter: Linear,Linear\nbody\n  bounds: 0,0,10,10\n\neffects/glow.png\nsize: 512,512\nfilter: Linear,Linear\nglow\n  bounds: 0,0,10,10\n`
  assert.deepEqual(atlasPageNames(atlas), ["hero.png", "effects/glow.png"])
})

test("pairs an atlas with a same-named skeleton", () => {
  assert.deepEqual(pairSpineFiles(["other.json", "hero.atlas", "hero.skel"]), {
    atlas: "hero.atlas",
    skeleton: "hero.skel",
  })
  assert.throws(() => pairSpineFiles(["a.atlas", "b.atlas", "x.skel", "y.skel"]), /多组 Spine 文件/)
})

test("inspects and validates a Spine 4.2 directory", () => {
  const root = path.posix.resolve("/roles/hero")
  const contents = new Map([
    [`${root}/hero.atlas`, "hero.png\nsize: 64,64\nfilter: Linear,Linear\nbody\n  bounds: 0,0,64,64\n"],
    [`${root}/hero.json`, JSON.stringify({ skeleton: { spine: "4.2.12" }, skins: [{ name: "default" }], animations: { Idle: {}, Talk: {} } })],
  ])
  const fileSystem = {
    readdirSync: () => ["hero.atlas", "hero.json", "hero.png"].map((name) => ({ name, isFile: () => true })),
    readFileSync: (filePath) => contents.get(filePath),
    statSync: (filePath) => ({ isFile: () => filePath === `${root}/hero.png` }),
  }
  const result = inspectSpineDirectory(root, { fileSystem, pathApi: path.posix })
  assert.equal(result.runtimeVersion, "4.2.12")
  assert.equal(result.defaultSkin, "default")
  assert.equal(result.idleAnimation, "Idle")
  assert.deepEqual(result.textures, [{ pageName: "hero.png", filePath: `${root}/hero.png` }])
})

test("rejects unsupported JSON exports and missing atlas textures", () => {
  const root = "/roles/hero"
  const baseFileSystem = {
    readdirSync: () => ["hero.atlas", "hero.json"].map((name) => ({ name, isFile: () => true })),
    readFileSync: (filePath) => filePath.endsWith(".atlas")
      ? "missing.png\nsize: 64,64\n"
      : JSON.stringify({ skeleton: { spine: "4.1.0" } }),
    statSync: () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }) },
  }
  assert.throws(() => inspectSpineDirectory(root, { fileSystem: baseFileSystem, pathApi: path.posix }), /缺少 atlas 引用的纹理/)

  const versionFileSystem = {
    ...baseFileSystem,
    statSync: () => ({ isFile: () => true }),
  }
  assert.throws(() => inspectSpineDirectory(root, { fileSystem: versionFileSystem, pathApi: path.posix }), /只支持 Spine 4.2/)
})
