import { releaseToolFiles } from './release_tool_files.mjs'
import { spawn } from 'node:child_process'
import { createReadStream, constants } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, link, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = fileURLToPath(new URL('../../', import.meta.url))
const platform = process.argv[2] ?? process.platform, arch = process.argv[3] ?? process.arch
if (process.argv.length > 4 || !['linux', 'win32', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Usage: archive_desktop.mjs <linux|win32|darwin> <x64|arm64>')
const name = `eden-agent-${platform}-${arch}`, app = path.join(frontend, 'dist/app', name)
const manifest = JSON.parse(await readFile(path.join(app, 'desktop-manifest.json'), 'utf8'))
if (manifest.platform !== platform || manifest.arch !== arch || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)) throw new Error('Desktop manifest does not match the requested release')
const releases = path.join(frontend, 'dist/releases')
await mkdir(releases, { recursive: true })
for (const file of releaseToolFiles) {
  const target = path.join(releases, file), source = fileURLToPath(new URL(file, import.meta.url))
  try { await copyFile(source, target, constants.COPYFILE_EXCL) }
  catch (error) {
    if (error.code !== 'EEXIST' || !(await readFile(source)).equals(await readFile(target))) throw error
  }
}
const output = path.join(releases, `${name}-${manifest.version}.tar.gz`), temporary = `${output}.staging-${randomUUID()}`
try {
  // tar preserves executable modes and symlinks which raw CI artifact uploads can lose.
  await new Promise((resolve, reject) => {
    const child = spawn('tar', ['-czf', temporary, '-C', path.dirname(app), name], { stdio: 'inherit', shell: false })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Desktop archive failed: ${signal ?? code}`)))
  })
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(temporary)) hash.update(bytes)
  const sha256 = hash.digest('hex'), bytes = (await stat(temporary)).size
  await link(temporary, output)
  await writeFile(`${output}.json`, JSON.stringify({ format: 1, file: path.basename(output), platform, arch, version: manifest.version, bytes, sha256,
    manifestSha256: createHash('sha256').update(await readFile(path.join(app, 'desktop-manifest.json'))).digest('hex'),
    signed: false, note: 'Checksum identifies these bytes; it is not a publisher signature or runtime acceptance result.' }, null, 2) + '\n', { flag: 'wx' })
  process.stdout.write(JSON.stringify({ output, sha256, bytes }) + '\n')
} finally { await rm(temporary, { force: true }) }
