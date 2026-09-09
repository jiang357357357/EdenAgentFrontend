import { releasePath, pathIdentity } from './release_paths.mjs'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir, readlink, realpath } from 'node:fs/promises'
import path from 'node:path'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export async function verifyInstalledFiles(directory, expectedManifestHash, release) {
  const root = await realpath(directory), manifestFile = path.join(root, 'desktop-manifest.json')
  const manifestInfo = await lstat(manifestFile)
  if (!manifestInfo.isFile() || manifestInfo.size > 32 * 1024 * 1024) throw new Error('Invalid desktop manifest file')
  const bytes = await readFile(manifestFile)
  if (digest(bytes) !== expectedManifestHash) throw new Error('Desktop manifest differs from the signed release')
  const manifest = JSON.parse(bytes.toString('utf8'))
  if (manifest.format !== 1 || manifest.platform !== release.platform || manifest.arch !== release.arch || manifest.version !== release.version || !Array.isArray(manifest.entries)) throw new Error('Installed desktop manifest identity mismatch')
  const expected = new Map(), identities = new Set()
  for (const entry of manifest.entries) {
    releasePath(entry.file)
    const identity = pathIdentity(entry.file, release.platform)
    if (identities.has(identity) || entry.file === 'desktop-manifest.json') throw new Error('Duplicate desktop manifest path')
    identities.add(identity)
    expected.set(entry.file, entry)
  }
  const seen = new Set()
  async function walk(relative = '') {
    for (const name of await readdir(path.join(root, relative))) {
      const file = relative ? `${relative}/${name}` : name, absolute = path.join(root, file), info = await lstat(absolute)
      releasePath(file)
      if (info.isDirectory()) { await walk(file); continue }
      if (file === 'desktop-manifest.json') continue
      const entry = expected.get(file)
      if (!entry) throw new Error(`Unlisted installed file: ${file}`)
      seen.add(file)
      if (info.isSymbolicLink() && entry.kind === 'symlink') {
        const target = await readlink(absolute), scoped = path.relative(root, await realpath(absolute))
        if (target !== entry.target || path.isAbsolute(target) || path.isAbsolute(scoped) || scoped === '..' || scoped.startsWith(`..${path.sep}`)) throw new Error(`Invalid installed symbolic link: ${file}`)
      } else if (info.isFile() && entry.kind === 'file') {
        if (info.size !== entry.bytes || process.platform !== 'win32' && (info.mode & 0o777) !== entry.mode) throw new Error(`Installed file size or permissions changed: ${file}`)
        const hash = createHash('sha256')
        for await (const chunk of createReadStream(absolute)) hash.update(chunk)
        if (hash.digest('hex') !== entry.sha256) throw new Error(`Installed file digest changed: ${file}`)
      } else throw new Error(`Installed file type changed: ${file}`)
    }
  }
  await walk()
  if (seen.size !== expected.size) throw new Error('Installed desktop is missing manifest files')
  return manifest
}
