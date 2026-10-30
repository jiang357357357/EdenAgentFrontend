import { releasePath, pathIdentity } from './release_paths.mjs'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, readlink, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Inventory packaged files without starting Electron, Node or native helpers. */
export async function writeDesktopManifest(directory, metadata) {
  const root = await realpath(directory), entries = [], identities = new Set(), pending = []
  let active = 0
  const waiting = []
  async function limited(work) {
    if (active >= 16) await new Promise(resolve => waiting.push(resolve))
    active++
    try { await work() } finally { active--; waiting.shift()?.() }
  }
  async function walk(relative = '') {
    const names = await readdir(path.join(root, relative), { withFileTypes: true })
    names.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    for (const entry of names) {
      const file = path.join(relative, entry.name), absolute = path.join(root, file)
      const portable = releasePath(file.split(path.sep).join('/'))
      const identity = pathIdentity(portable, metadata.platform)
      if (identities.has(identity)) throw new Error('Desktop resources collide on the target filesystem')
      identities.add(identity)
      if (entry.isDirectory()) { await walk(file); continue }
      const task = limited(async () => {
      const info = await lstat(absolute)
      if (info.isSymbolicLink()) {
        const target = await readlink(absolute), resolved = await realpath(absolute), scoped = path.relative(root, resolved)
        if (path.isAbsolute(target) || scoped === '..' || scoped.startsWith(`..${path.sep}`) || path.isAbsolute(scoped)) throw new Error(`Desktop link escapes the distribution: ${portable}`)
        entries.push({ file: portable, kind: 'symlink', target })
        return
      }
      if (!info.isFile()) throw new Error(`Unsupported desktop resource: ${portable}`)
      const hash = createHash('sha256')
      for await (const bytes of createReadStream(absolute)) hash.update(bytes)
      entries.push({ file: portable, kind: 'file', bytes: info.size, mode: info.mode & 0o777, sha256: hash.digest('hex') })
      })
      task.catch(() => {})
      pending.push(task)
    }
  }
  try { await walk() } catch (error) { await Promise.allSettled(pending); throw error }
  const results = await Promise.allSettled(pending)
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
  entries.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
  await writeFile(path.join(root, 'desktop-manifest.json'), JSON.stringify({ format: 1, ...metadata, entries }, null, 2) + '\n', { flag: 'wx' })
}
