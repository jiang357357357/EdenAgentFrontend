import { createHash, createPublicKey } from 'node:crypto'
import { chmod, copyFile, lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { installedVersion, readVersionSelection, withInstallationLock } from './installed_version.mjs'

const [directory, trustedKey, confirmation] = process.argv.slice(2)
if (process.argv.length !== 5 || confirmation !== '--confirm-launcher') throw new Error('Usage: setup_launcher.mjs <installation-dir> <trusted-public-key.pem> --confirm-launcher')
const tools = ['release_paths.mjs', 'launch_version.mjs', 'select_version.mjs', 'installed_version.mjs', 'installed_files.mjs', 'release_signature.mjs']
const quoteSh = value => `'${value.replaceAll("'", "'\\''")}'`
const quotePs = value => `'${value.replaceAll("'", "''")}'`
await withInstallationLock(directory, async root => {
  if (/[\r\n\0]/.test(root)) throw new Error('Launcher installation path cannot contain control characters')
  const selection = await readVersionSelection(root)
  if (!selection) throw new Error('Select an installed version before creating its launcher')
  const { executable, release } = await installedVersion(root, selection.version, trustedKey)
  const resources = process.platform === 'darwin' ? path.resolve(path.dirname(executable), '../Resources') : path.join(path.dirname(executable), 'resources')
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
  const target = path.join(root, 'launcher')
  try { await lstat(target); throw new Error('Launcher already exists; do not replace a running or trusted launcher implicitly') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const temporary = await mkdtemp(path.join(root, '.launcher-'))
  try {
    await copyFile(path.join(resources, 'node', nodeName), path.join(temporary, nodeName))
    for (const file of tools) await copyFile(path.join(resources, 'app/release-tools', file), path.join(temporary, file))
    const appRoot = path.join(root, 'versions', selection.version, 'app')
    const manifestBytes = await readFile(path.join(appRoot, 'desktop-manifest.json'))
    if (createHash('sha256').update(manifestBytes).digest('hex') !== release.manifestSha256) throw new Error('Installed manifest changed during launcher setup')
    const entries = JSON.parse(manifestBytes.toString('utf8')).entries
    for (const file of [nodeName, ...tools]) {
      const original = file === nodeName ? path.join(resources, 'node', file) : path.join(resources, 'app/release-tools', file)
      const relative = path.relative(appRoot, original).split(path.sep).join('/')
      const expected = entries.find(entry => entry.file === relative && entry.kind === 'file')
      const copied = await readFile(path.join(temporary, file))
      if (!expected || copied.length !== expected.bytes || createHash('sha256').update(copied).digest('hex') !== expected.sha256) throw new Error('Launcher copy differs from the signed file manifest')
    }
    const publicKey = createPublicKey(await readFile(trustedKey))
    const publicBytes = publicKey.export({ type: 'spki', format: 'der' })
    if (publicKey.asymmetricKeyType !== 'ed25519' || createHash('sha256').update(publicBytes).digest('hex') !== release.keyId) throw new Error('Trusted launcher key changed during setup')
    await writeFile(path.join(temporary, 'publisher.pem'), publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' })
    const node = path.join(target, nodeName), script = path.join(target, 'launch_version.mjs'), key = path.join(target, 'publisher.pem')
    if (process.platform === 'win32') {
      await writeFile(path.join(temporary, 'start-eden.ps1'), `$ErrorActionPreference = 'Stop'\n& ${[node, script, root, key].map(quotePs).join(' ')}\nexit $LASTEXITCODE\n`, { flag: 'wx' })
    } else {
      await chmod(path.join(temporary, nodeName), 0o755)
      await writeFile(path.join(temporary, 'start-eden.sh'), `#!/bin/sh\nexec ${[node, script, root, key].map(quoteSh).join(' ')}\n`, { flag: 'wx', mode: 0o755 })
    }
    await writeFile(path.join(temporary, 'launcher.json'), JSON.stringify({ format: 1, sourceVersion: selection.version, publisherKeyId: release.keyId,
      node: '22.23.1', createdAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' })
    await rename(temporary, target)
    process.stdout.write(JSON.stringify({ launcher: target, selectedVersion: selection.version }) + '\n')
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
