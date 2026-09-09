import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { verifyRelease } from './release_signature.mjs'
import { verifyInstalledFiles } from './installed_files.mjs'

const [descriptorFile, signatureFile, trustedKeyFile, extractedDirectory, installationDirectory, confirmation] = process.argv.slice(2)
if (process.argv.length !== 8 || confirmation !== '--confirm-install') throw new Error('Usage: install_release.mjs <descriptor.json> <signature.json> <trusted-key.pem> <extracted-app-directory> <installation-directory> --confirm-install')
const release = await verifyRelease(descriptorFile, signatureFile, trustedKeyFile)
if (release.platform !== process.platform || release.arch !== process.arch) throw new Error('Install with Node matching the release platform and architecture')
const source = await realpath(extractedDirectory)
await verifyInstalledFiles(source, release.manifestSha256, release)
await mkdir(path.resolve(installationDirectory), { recursive: true })
const destination = await realpath(installationDirectory), relative = path.relative(source, destination)
if (!relative || !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('Installation directory must be outside the extracted application')
const lockFile = path.join(destination, '.install.lock'), lock = await open(lockFile, 'wx', 0o600)
let staging
try {
  const versions = path.join(destination, 'versions')
  await mkdir(versions, { recursive: true })
  if ((await lstat(versions)).isSymbolicLink()) throw new Error('Installation versions directory cannot be a symbolic link')
  const target = path.join(versions, `${release.version}-${release.platform}-${release.arch}`)
  try { await lstat(target); throw new Error('Version already exists; choose a new version or inspect the existing installation') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  staging = await mkdtemp(path.join(destination, '.install-'))
  const stagedApp = path.join(staging, 'app')
  await cp(source, stagedApp, { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: true, force: false })
  await verifyInstalledFiles(stagedApp, release.manifestSha256, release)
  const descriptorBytes = await readFile(descriptorFile)
  if (createHash('sha256').update(descriptorBytes).digest('hex') !== release.descriptorSha256) throw new Error('Release descriptor changed during installation')
  await writeFile(path.join(staging, 'release.json'), descriptorBytes, { flag: 'wx' })
  await writeFile(path.join(staging, 'signature.json'), await readFile(signatureFile), { flag: 'wx' })
  await writeFile(path.join(staging, 'installation.json'), JSON.stringify({ format: 1, ...release, archive: undefined, manifestSha256: release.manifestSha256, installedAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' })
  await rename(staging, target); staging = undefined
  process.stdout.write(JSON.stringify({ installed: target, activated: false, note: 'Version installed separately; current application and runtime data were not switched.' }) + '\n')
} finally {
  if (staging) await rm(staging, { recursive: true, force: true })
  await lock.close(); await rm(lockFile, { force: true })
}
