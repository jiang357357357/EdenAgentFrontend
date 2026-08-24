const fs = require("node:fs")
const path = require("node:path")

function atlasPageNames(contents) {
  const pages = []
  for (const block of String(contents).replace(/^\uFEFF/, "").split(/\r?\n\s*\r?\n/)) {
    const name = block.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (name && !name.includes(":")) pages.push(name.replaceAll("\\", "/"))
  }
  return [...new Set(pages)]
}

function spineJsonMetadata(contents) {
  try {
    const parsed = JSON.parse(contents)
    const version = typeof parsed?.skeleton?.spine === "string" ? parsed.skeleton.spine.trim() : ""
    const animationNames = parsed?.animations && typeof parsed.animations === "object"
      ? Object.keys(parsed.animations)
      : []
    const skinNames = Array.isArray(parsed?.skins)
      ? parsed.skins.map((skin) => skin?.name).filter((name) => typeof name === "string")
      : parsed?.skins && typeof parsed.skins === "object"
        ? Object.keys(parsed.skins)
        : []
    const idleAnimation = animationNames.find((name) => name.toLowerCase() === "idle")
      ?? animationNames.find((name) => name.toLowerCase() === "idle_01")
      ?? animationNames.find((name) => name.toLowerCase().includes("idle"))
      ?? ""
    const defaultSkin = skinNames.find((name) => name.toLowerCase() === "default") ?? skinNames[0] ?? ""
    return { runtimeVersion: version, defaultSkin, idleAnimation }
  } catch (error) {
    throw new Error(`Spine JSON 无法解析：${error instanceof Error ? error.message : String(error)}`)
  }
}

function pairSpineFiles(files) {
  const atlases = files.filter((name) => name.toLowerCase().endsWith(".atlas"))
  const skeletons = files.filter((name) => /\.(skel|json)$/i.test(name))
  if (atlases.length === 0) throw new Error("目录中没有找到 .atlas 文件")
  if (skeletons.length === 0) throw new Error("目录中没有找到 .skel 或 .json 骨骼文件")

  for (const atlas of atlases) {
    const base = atlas.slice(0, -".atlas".length).toLowerCase()
    const matches = skeletons.filter((name) => name.replace(/\.(skel|json)$/i, "").toLowerCase() === base)
    if (matches.length === 1) return { atlas, skeleton: matches[0] }
  }
  if (atlases.length === 1 && skeletons.length === 1) return { atlas: atlases[0], skeleton: skeletons[0] }
  throw new Error("检测到多组 Spine 文件，请仅保留一组同名的骨骼和 atlas 文件")
}

function inspectSpineDirectory(directory, { fileSystem = fs, pathApi = path } = {}) {
  const root = pathApi.resolve(directory)
  const entries = fileSystem.readdirSync(root, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  const pair = pairSpineFiles(files)
  const atlasPath = pathApi.join(root, pair.atlas)
  const skeletonPath = pathApi.join(root, pair.skeleton)
  const pages = atlasPageNames(fileSystem.readFileSync(atlasPath, "utf8"))
  if (pages.length === 0) throw new Error("atlas 中没有找到纹理页")

  const textures = pages.map((pageName) => {
    const filePath = pathApi.resolve(root, ...pageName.split("/"))
    const relative = pathApi.relative(root, filePath)
    if (!relative || relative === ".." || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) {
      throw new Error(`atlas 纹理路径超出所选目录：${pageName}`)
    }
    let stats
    try {
      stats = fileSystem.statSync(filePath)
    } catch {
      throw new Error(`缺少 atlas 引用的纹理：${pageName}`)
    }
    if (!stats.isFile()) throw new Error(`atlas 纹理不是文件：${pageName}`)
    return { pageName, filePath }
  })

  const jsonMetadata = pair.skeleton.toLowerCase().endsWith(".json")
    ? spineJsonMetadata(fileSystem.readFileSync(skeletonPath, "utf8"))
    : { runtimeVersion: "", defaultSkin: "", idleAnimation: "" }
  if (jsonMetadata.runtimeVersion && !jsonMetadata.runtimeVersion.startsWith("4.2")) {
    throw new Error(`当前只支持 Spine 4.2，检测到 ${jsonMetadata.runtimeVersion}`)
  }

  return {
    directory: root,
    skeletonPath,
    atlasPath,
    textures,
    runtimeVersion: jsonMetadata.runtimeVersion,
    defaultSkin: jsonMetadata.defaultSkin,
    idleAnimation: jsonMetadata.idleAnimation,
    layout: "standee",
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  }
}

module.exports = { atlasPageNames, inspectSpineDirectory, pairSpineFiles, spineJsonMetadata }
