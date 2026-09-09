import { releasePath, pathIdentity } from './release_paths.mjs'
import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { chmod, mkdir, open, symlink } from 'node:fs/promises'
import path from 'node:path'

function octal(bytes) {
  const value = bytes.toString('ascii').replace(/\0.*$/, '').trim()
  if (!/^[0-7]*$/.test(value)) throw new Error('Unsupported tar numeric encoding')
  const number = value ? parseInt(value, 8) : 0
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid tar size')
  return number
}
const text = bytes => bytes.toString('utf8').replace(/\0.*$/, '')
function pax(bytes) {
  const result = {}
  let offset = 0
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset), count = Number(bytes.subarray(offset, space).toString('ascii'))
    if (space < offset || !Number.isSafeInteger(count) || count <= space - offset + 1 || offset + count > bytes.length || bytes[offset + count - 1] !== 10) throw new Error('Invalid tar extension')
    const record = bytes.subarray(space + 1, offset + count - 1).toString('utf8'), equal = record.indexOf('=')
    if (equal < 1) throw new Error('Invalid tar extension field')
    const key = record.slice(0, equal)
    if (key.includes('sparse')) throw new Error('Sparse release entries are unsupported')
    result[key] = record.slice(equal + 1); offset += count
  }
  return result
}

/** Restricted tar reader for project-produced archives. Links are created after all files. */
export async function extractRelease(archive, destination, expectedRoot) {
  const input = createReadStream(archive), gzip = createGunzip()
  input.on('error', error => gzip.destroy(error)); input.pipe(gzip)
  const iterator = gzip[Symbol.asyncIterator](), links = [], seen = new Set(), ancestors = new Set()
  let buffered = Buffer.alloc(0), total = 0, entries = 0, extensions = {}, longName, longLink
  async function take(count) {
    while (buffered.length < count) {
      const next = await iterator.next()
      if (next.done) throw new Error('Truncated release archive')
      total += next.value.length
      if (total > 16 * 1024 ** 3) throw new Error('Expanded release exceeds 16 GiB')
      buffered = Buffer.concat([buffered, next.value])
    }
    const bytes = buffered.subarray(0, count); buffered = buffered.subarray(count); return bytes
  }
  function scoped(name) {
    const value = releasePath(typeof name === 'string' ? name.replace(/\/$/, '') : name)
    if (value.split('/')[0] !== expectedRoot) throw new Error('Release path is outside its expected root')
    return value
  }
  try {
    for (;;) {
      const header = await take(512)
      if (header.every(byte => byte === 0)) {
        if (!(await take(512)).every(byte => byte === 0)) throw new Error('Invalid tar end marker')
        if (buffered.some(byte => byte !== 0)) throw new Error('Unexpected data after tar end')
        for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) {
          total += chunk.length
          if (total > 16 * 1024 ** 3 || chunk.some(byte => byte !== 0)) throw new Error('Unexpected data after tar end')
        }
        break
      }
      if (++entries > 200000) throw new Error('Release has too many archive entries')
      const checksum = octal(header.subarray(148, 156))
      let sum = 0
      for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i]
      if (sum !== checksum) throw new Error('Tar header checksum mismatch')
      const type = String.fromCharCode(header[156]), headerSize = octal(header.subarray(124, 136))
      if (['x', 'g', 'L', 'K'].includes(type)) {
        if (headerSize > 1024 * 1024) throw new Error('Tar extension exceeds 1 MiB')
        const bytes = await take(headerSize); await take((512 - headerSize % 512) % 512)
        if (type === 'g') { const values = pax(bytes); if (Object.keys(values).some(key => !['mtime', 'atime', 'ctime', 'uid', 'gid', 'uname', 'gname'].includes(key))) throw new Error('Unsupported global tar extension') }
        else if (type === 'x') extensions = pax(bytes)
        else if (type === 'L') longName = text(bytes)
        else longLink = text(bytes)
        continue
      }
      const prefix = text(header.subarray(345, 500)), base = text(header.subarray(0, 100))
      const name = scoped(extensions.path ?? longName ?? (prefix && text(header.subarray(257, 263)) === 'ustar' ? `${prefix}/${base}` : base))
      const size = extensions.size === undefined ? headerSize : Number(extensions.size)
      const link = extensions.linkpath ?? longLink ?? text(header.subarray(157, 257))
      extensions = {}; longName = undefined; longLink = undefined
      if (!Number.isSafeInteger(size) || size < 0 || size > 4 * 1024 ** 3 || seen.has(pathIdentity(name))) throw new Error('Duplicate release entry or unsupported size')
      seen.add(pathIdentity(name))
      const parts = name.split('/')
      for (let depth = 1; depth < parts.length; depth++) ancestors.add(pathIdentity(parts.slice(0, depth).join('/')))
      const target = path.join(destination, name)
      if (type === '5') { if (size) throw new Error('Directory has unexpected payload'); await mkdir(target, { recursive: true }) }
      else if (type === '2') {
        if (size || !link || link.includes('\\') || link.includes(':') || path.posix.isAbsolute(link)) throw new Error('Invalid release link')
        scoped(path.posix.normalize(path.posix.join(path.posix.dirname(name), link)))
        links.push({ target, link, name })
      } else if (type === '0' || type === '\0') {
        await mkdir(path.dirname(target), { recursive: true })
        const file = await open(target, 'wx', 0o600)
        try {
          let remaining = size
          while (remaining) {
            const bytes = await take(Math.min(65536, remaining)); let offset = 0
            while (offset < bytes.length) { const result = await file.write(bytes, offset, bytes.length - offset); if (!result.bytesWritten) throw new Error('Release extraction made no write progress'); offset += result.bytesWritten }
            remaining -= bytes.length
          }
        } finally { await file.close() }
        await chmod(target, octal(header.subarray(100, 108)) & 0o777)
      } else throw new Error(`Unsupported release tar entry type: ${type}`)
      await take((512 - size % 512) % 512)
    }
    for (const item of links) {
      if (ancestors.has(pathIdentity(item.name))) throw new Error('Release link is a parent of another entry')
      await mkdir(path.dirname(item.target), { recursive: true }); await symlink(item.link, item.target)
    }
    return path.join(destination, expectedRoot)
  } finally { input.destroy(); gzip.destroy() }
}
