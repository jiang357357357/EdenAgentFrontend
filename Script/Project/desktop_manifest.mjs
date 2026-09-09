import { releasePath, pathIdentity } from './release_paths.mjs'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, readlink, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Inventory packaged files without starting Electron, Node or native helpers. */
export async function writeDesktopManifest(directory, metadata) {
  const root = await realpath(directory), entries = [], identities = new Set()
  async function walk(relative = '') {
    const names = await readdir(path.join(root, relative))
    names.sort()
    for (const name of names) {
      const file = path.join(relative, name), absolute = path.join(root, file), info = await lstat(absolute)
      const portable = releasePath(file.split(path.sep).join('/'))
      const identity = pathIdentity(portable, metadata.platform)
      if (identities.has(identity)) throw new Error('Desktop resources collide on the target filesystem')
      identities.add(identity)
      if (info.isDirectory()) { await walk(file); continue }
      if (info.isSymbolicLink()) {
        const target = await readlink(absolute), resolved = await realpath(absolute), scoped = path.relative(root, resolved)
        if (path.isAbsolute(target) || scoped === '..' || scoped.startsWith(`..${path.sep}`) || path.isAbsolute(scoped)) throw new Error(`Desktop link escapes the distribution: ${portable}`)
        entries.push({ file: portable, kind: 'symlink', target })
        continue
      }
      if (!info.isFile()) throw new Error(`Unsupported desktop resource: ${portable}`)
      const hash = createHash('sha256')
      for await (const bytes of createReadStream(absolute)) hash.update(bytes)
      entries.push({ file: portable, kind: 'file', bytes: info.size, mode: info.mode & 0o777, sha256: hash.digest('hex') })
    }
  }
  await walk()
  await writeFile(path.join(root, 'desktop-manifest.json'), JSON.stringify({ format: 1, ...metadata, entries }, null, 2) + '\n', { flag: 'wx' })
}
