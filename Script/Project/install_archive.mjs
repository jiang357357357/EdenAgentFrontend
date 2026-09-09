import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyRelease } from './release_signature.mjs'
import { extractRelease } from './extract_release.mjs'

const [descriptor, signature, trustedKey, destination, confirmation] = process.argv.slice(2)
if (process.argv.length !== 7 || confirmation !== '--confirm-install') throw new Error('Usage: install_archive.mjs <descriptor.json> <signature.json> <trusted-key.pem> <installation-directory> --confirm-install')
const original = await verifyRelease(descriptor, signature, trustedKey)
if (original.platform !== process.platform || original.arch !== process.arch) throw new Error('Archive platform does not match the installer')
const temporary = await mkdtemp(path.join(os.tmpdir(), 'eden-install-archive-'))
try {
  const snapshotDescriptor = path.join(temporary, 'release.json'), snapshotSignature = path.join(temporary, 'signature.json'), snapshotKey = path.join(temporary, 'publisher.pem')
  await copyFile(descriptor, snapshotDescriptor); await copyFile(signature, snapshotSignature); await copyFile(trustedKey, snapshotKey)
  await copyFile(original.archive, path.join(temporary, path.basename(original.archive)))
  const captured = await verifyRelease(snapshotDescriptor, snapshotSignature, snapshotKey)
  if (captured.descriptorSha256 !== original.descriptorSha256 || captured.keyId !== original.keyId) throw new Error('Release or trust key changed while capturing the archive')
  const expanded = path.join(temporary, 'expanded'); await mkdir(expanded)
  const app = await extractRelease(captured.archive, expanded, `eden-agent-${captured.platform}-${captured.arch}`)
  const installer = fileURLToPath(new URL('./install_release.mjs', import.meta.url))
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installer, snapshotDescriptor, snapshotSignature, snapshotKey, app, path.resolve(destination), '--confirm-install'], { stdio: 'inherit', shell: false })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Release installation failed: ${signal ?? code}`)))
  })
} finally { await rm(temporary, { recursive: true, force: true }) }
