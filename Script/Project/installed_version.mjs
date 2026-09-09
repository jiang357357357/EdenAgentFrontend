import { randomUUID } from 'node:crypto'
import { lstat, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { verifyReleaseDescriptor } from './release_signature.mjs'
import { verifyInstalledFiles } from './installed_files.mjs'

const versionName = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?-(linux|win32|darwin)-(x64|arm64)$/
export async function withInstallationLock(directory, work) {
  const root = await realpath(directory), filename = path.join(root, '.install.lock'), lock = await open(filename, 'wx', 0o600)
  try { return await work(root, lock) } finally { await lock.close(); await rm(filename, { force: true }) }
}
export async function readVersionSelection(root) {
  const filename = path.join(root, 'current-version.json')
  let info
  try { info = await lstat(filename) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
  if (!info.isFile() || info.size > 16384) throw new Error('Invalid installed version selection file')
  const value = JSON.parse(await readFile(filename, 'utf8'))
  if (value.format !== 1 || typeof value.revision !== 'string' || !/^[a-f0-9-]{36}$/.test(value.revision) || !versionName.test(value.version) ||
    value.previous !== null && !versionName.test(value.previous) || typeof value.note !== 'string' || !value.note.trim()) throw new Error('Invalid installed version selection')
  return value
}
export async function installedVersion(root, version, trustedPublicKey) {
  if (!versionName.test(version)) throw new Error('Invalid installed version name')
  const directory = path.join(root, 'versions', version), canonical = await realpath(directory)
  if (canonical !== directory || (await lstat(path.join(root, 'versions'))).isSymbolicLink()) throw new Error('Installed version must remain inside its installation directory')
  const release = await verifyReleaseDescriptor(path.join(directory, 'release.json'), path.join(directory, 'signature.json'), trustedPublicKey)
  if (`${release.version}-${release.platform}-${release.arch}` !== version || release.platform !== process.platform || release.arch !== process.arch) throw new Error('Installed version platform does not match this launcher')
  const app = path.join(directory, 'app')
  if ((await lstat(app)).isSymbolicLink()) throw new Error('Installed application cannot be replaced by a symbolic link')
  await verifyInstalledFiles(app, release.manifestSha256, release)
  const executable = release.platform === 'darwin' ? path.join(app, 'eden-agent.app/Contents/MacOS/eden-agent') : path.join(app, release.platform === 'win32' ? 'eden-agent.exe' : 'eden-agent')
  return { executable, release }
}
export async function selectInstalledVersion(root, version, expectedRevision, trustedPublicKey, note) {
  if (!note.trim() || note.length > 4000) throw new Error('Version selection requires a bounded explanation')
  const previous = await readVersionSelection(root)
  if ((previous?.revision ?? 'none') !== expectedRevision) throw new Error('Installed version selection changed; reload before switching')
  await installedVersion(root, version, trustedPublicKey)
  const selection = { format: 1, revision: randomUUID(), version, previous: previous?.version ?? null, note, changedAt: new Date().toISOString() }
  const staging = path.join(root, `.version-${selection.revision}.json`)
  try {
    await writeFile(staging, JSON.stringify(selection, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    const file = await open(staging, 'r+')
    try { await file.sync() } finally { await file.close() }
    await rename(staging, path.join(root, 'current-version.json'))
  } finally { await rm(staging, { force: true }) }
  return selection
}
