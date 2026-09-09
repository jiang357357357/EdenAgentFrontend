import { createHash, createPublicKey } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { installedVersion } from './installed_version.mjs'

export async function verifyLauncher(root, trustedKey) {
  const launcher = path.join(root, 'launcher')
  if (await realpath(launcher) !== launcher) throw new Error('Launcher directory must not be redirected')
  const receiptFile = path.join(launcher, 'launcher.json'), info = await lstat(receiptFile)
  if (!info.isFile() || info.size > 16384) throw new Error('Invalid launcher receipt')
  const receipt = JSON.parse(await readFile(receiptFile, 'utf8'))
  if (receipt.format !== 1 || typeof receipt.sourceVersion !== 'string') throw new Error('Invalid launcher receipt')
  const { executable, release } = await installedVersion(root, receipt.sourceVersion, trustedKey)
  const keyFile = path.join(launcher, 'publisher.pem'), keyInfo = await lstat(keyFile)
  if (!keyInfo.isFile() || keyInfo.size > 16384) throw new Error('Invalid launcher publisher key')
  const key = createPublicKey(await readFile(keyFile))
  const keyId = createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex')
  if (key.asymmetricKeyType !== 'ed25519' || keyId !== release.keyId || receipt.publisherKeyId !== keyId) throw new Error('Launcher publisher differs from the trusted installation')
  const resources = process.platform === 'darwin' ? path.resolve(path.dirname(executable), '../Resources') : path.join(path.dirname(executable), 'resources')
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
  const files = [nodeName, 'release_paths.mjs', 'launch_version.mjs', 'select_version.mjs', 'installed_version.mjs', 'installed_files.mjs', 'release_signature.mjs']
  for (const file of files) {
    const target = path.join(launcher, file), stat = await lstat(target)
    const original = path.join(resources, file === nodeName ? 'node' : 'app/release-tools', file)
    if (!stat.isFile() || stat.size !== (await lstat(original)).size) throw new Error(`Launcher file changed: ${file}`)
    const digest = content => createHash('sha256').update(content).digest('hex')
    if (digest(await readFile(target)) !== digest(await readFile(original))) throw new Error(`Launcher file changed: ${file}`)
    if (file === nodeName && process.platform !== 'win32' && !(stat.mode & 0o100)) throw new Error('Launcher Node is not executable')
  }
  return { sourceVersion: receipt.sourceVersion, publisherKeyId: keyId }
}
