import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const startupSceneContract = JSON.parse(readFileSync(new URL('./startup_scene_contract.json', import.meta.url), 'utf8'))
export const startupSceneFiles = [...Object.entries(startupSceneContract.models).flatMap(([model, textures]) =>
  [model + '.skel', model + '.atlas', ...textures]), ...startupSceneContract.posters, ...startupSceneContract.notices]
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => { throw new Error(`Startup scene: ${message}`) }
const safeName = name => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) && !name.includes('..')
  && !name.endsWith('.') && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)

async function regularFile(filename, maximum) {
  const info = await lstat(filename)
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum) fail(`invalid resource file: ${path.basename(filename)}`)
  const bytes = await readFile(filename)
  if (bytes.length !== info.size) fail(`resource changed while reading: ${path.basename(filename)}`)
  return bytes
}

/** Capture validated bytes before staging; no dependency on a developer's ignored public directory. */
export async function snapshotStartupScene(directory) {
  const info = await lstat(directory).catch(error => {
    if (error.code === 'ENOENT') fail('resource directory missing; set EDEN_AGENT_STARTUP_SCENE_SOURCE to a deliverable scene pack')
    throw error
  })
  if (!info.isDirectory() || info.isSymbolicLink()) fail('resource root must be a regular directory')
  const manifestBytes = await regularFile(path.join(directory, 'manifest.json'), 64 * 1024)
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  if (manifest.localOnly !== false) fail('localOnly resources cannot be packaged; prepare a deliverable pack with its distribution notice')
  if (manifest.schemaVersion !== startupSceneContract.schemaVersion || manifest.resourceId !== startupSceneContract.resourceId) fail('unsupported resource manifest')
  if (typeof manifest.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(manifest.version) || manifest.version.includes('..')) fail('invalid independent resource version')
  if (!Array.isArray(manifest.files) || manifest.files.length > 32) fail('invalid resource file list')
  const files = new Map()
  const identities = new Set()
  let total = manifestBytes.length
  for (const entry of manifest.files) {
    const name = entry?.name
    if (!safeName(name) || name === 'manifest.json' || identities.has(name.toLowerCase())) fail('unsafe or duplicate resource filename')
    identities.add(name.toLowerCase())
    if (!startupSceneFiles.includes(name) && !/\.(?:txt|md)$/i.test(name)) fail(`unexpected resource type: ${name}`)
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail(`invalid integrity metadata: ${name}`)
    const bytes = await regularFile(path.join(directory, name), 32 * 1024 * 1024)
    if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) fail(`size/SHA-256 mismatch: ${name}`)
    total += bytes.length
    if (total > 128 * 1024 * 1024) fail('resource pack exceeds 128 MiB')
    files.set(name, bytes)
  }
  for (const name of startupSceneFiles) if (!files.has(name)) fail(`required resource missing: ${name}`)
  const actual = await readdir(directory)
  if (actual.length !== files.size + 1 || actual.some(name => name !== 'manifest.json' && !files.has(name))) fail('resource directory contains unlisted files')
  for (const [model, expected] of Object.entries(startupSceneContract.models)) {
    const lines = files.get(model + '.atlas').toString('utf8').split(/\r?\n/)
    const pages = lines.filter((line, index) => /\.png$/.test(line) && (!index || !lines[index - 1].trim())
      && /^\s*(?:size|format|filter|repeat|pma|scale):/.test(lines[index + 1] ?? ''))
    if (JSON.stringify(pages) !== JSON.stringify(expected)) fail(`atlas texture pages disagree: ${model}`)
  }
  for (const [name, bytes] of files) if (name.endsWith('.png')) {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      || bytes.toString('ascii', 12, 16) !== 'IHDR' || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20)) fail(`invalid PNG texture: ${name}`)
  }
  files.set('manifest.json', manifestBytes)
  return { files, record: { resourceId: manifest.resourceId, version: manifest.version,
    manifestSha256: hash(manifestBytes), fileCount: files.size, bytes: total } }
}

export async function installStartupScene(snapshot, destination) {
  await mkdir(destination)
  for (const [name, bytes] of snapshot.files) await writeFile(path.join(destination, name), bytes, { flag: 'wx' })
}

export async function stageDesktopWeb(web, destination, snapshot) {
  const source = path.resolve(web)
  await cp(source, destination, { recursive: true, filter: file => file !== path.join(source, 'startup-scene') })
  await installStartupScene(snapshot, path.join(destination, 'startup-scene'))
}

export function desktopScenePath(platform) {
  return `${platform === 'darwin' ? 'Contents/Resources' : 'resources'}/app/web/dist/startup-scene`
}

export async function verifyDesktopStartupScene(directory, platform, expected) {
  const relative = desktopScenePath(platform)
  const snapshot = await snapshotStartupScene(path.join(directory, relative))
  const record = { path: relative, ...snapshot.record }
  if (expected && JSON.stringify(record) !== JSON.stringify(expected)) fail('packaged resources differ from the captured source')
  return record
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--check') throw new Error('Usage: node startup_scene.mjs --check RESOURCE_DIRECTORY')
  const snapshot = await snapshotStartupScene(path.resolve(process.argv[3]))
  console.log(JSON.stringify(snapshot.record, null, 2))
}
