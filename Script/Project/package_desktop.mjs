import { releaseToolFiles } from './release_tool_files.mjs'
import { writeDesktopManifest } from './desktop_manifest.mjs'
import { packager } from '@electron/packager'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const frontend = fileURLToPath(new URL('../../', import.meta.url)), root = path.dirname(path.resolve(frontend))
const platform = process.argv[2] ?? process.platform, arch = process.argv[3] ?? process.arch
if (process.argv.length > 4 || !['linux', 'win32', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Usage: node Script/Project/package_desktop.mjs <linux|win32|darwin> <x64|arm64>')
const runtime = path.join(root, 'dist', `runtime-${platform}-${arch}`)
const manifest = JSON.parse(await readFile(path.join(runtime, 'runtime-manifest.json'), 'utf8'))
if (manifest.platform !== platform || manifest.arch !== arch || manifest.node !== '22.23.1' || !manifest.migration?.artifacts?.length) throw new Error('Prepare a matching TS runtime distribution with migration tools first')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
if (digest(await readFile(path.join(runtime, 'server/main.mjs'))) !== manifest.entrySha256) throw new Error('Server artifact differs from its manifest')
for (const artifact of manifest.migration.artifacts) {
  if (typeof artifact.file !== 'string' || !/^migration\/[a-zA-Z0-9.-]+$/.test(artifact.file)) throw new Error('Invalid migration artifact path')
  const bytes = await readFile(path.join(runtime, artifact.file))
  if (bytes.length !== artifact.bytes || digest(bytes) !== artifact.sha256) throw new Error(`Migration artifact changed: ${artifact.file}`)
}
await stat(path.join(frontend, 'web/dist/index.html'))
const output = path.join(frontend, 'dist/app'), target = path.join(output, `eden-agent-${platform}-${arch}`)
if (existsSync(target)) throw new Error(`Refusing to overwrite a desktop artifact: ${target}`)
const temporary = await mkdtemp(path.join(os.tmpdir(), 'eden-desktop-package-'))
try {
  const app = path.join(temporary, 'app')
  await mkdir(app)
  for (const relative of ['desktop/src', 'desktop/assets', 'web/dist']) await cp(path.join(frontend, relative), path.join(app, relative), { recursive: true })
  await mkdir(path.join(app, 'release-tools'))
  for (const file of releaseToolFiles) await cp(fileURLToPath(new URL(file, import.meta.url)), path.join(app, 'release-tools', file))
  const source = JSON.parse(await readFile(path.join(frontend, 'package.json'), 'utf8'))
  await writeFile(path.join(app, 'package.json'), JSON.stringify({ name: source.name, productName: 'Eden Agent',
    version: source.version, license: source.license, main: 'desktop/src/main.cjs', type: 'module' }, null, 2) + '\n')
  const resources = []
  for (const entry of await readdir(runtime, { withFileTypes: true })) {
    if (!entry.isFile() && !entry.isDirectory()) throw new Error('Runtime distribution contains an unsupported resource')
    resources.push(path.join(runtime, entry.name))
  }
  if (platform === 'win32') {
    const observer = path.join(frontend, 'desktop/native/win32-pointer-observer/bin/edenagent-pointer-observer.exe')
    await stat(observer); resources.push(observer)
  }
  const outputs = await packager({ dir: app, name: 'eden-agent', platform, arch, out: output,
    overwrite: false, electronVersion: '42.4.0', asar: false, prune: false,
    ...(platform === 'darwin' ? {} : { icon: path.join(frontend, 'desktop/assets', platform === 'win32' ? 'icon.ico' : 'icon.png') }),
    extraResource: resources,
  })
  for (const directory of outputs) await writeDesktopManifest(directory, { platform, arch, version: source.version, electron: '42.4.0', node: manifest.node, runtimeEntrySha256: manifest.entrySha256 })
  process.stdout.write(JSON.stringify({ outputs, runtime, platform, arch }, null, 2) + '\n')
} finally { await rm(temporary, { recursive: true, force: true }) }
