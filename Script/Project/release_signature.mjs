import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

async function boundedFile(filename, limit) {
  const info = await lstat(filename)
  if (!info.isFile() || info.size > limit) throw new Error('Release metadata or key is not a bounded regular file')
  return readFile(filename)
}
export async function releaseDescriptor(filename) {
  const bytes = await boundedFile(filename, 65536), descriptor = JSON.parse(bytes.toString('utf8'))
  if (descriptor.format !== 1 || typeof descriptor.file !== 'string' || !/^eden-agent-(linux|win32|darwin)-(x64|arm64)-[0-9][a-zA-Z0-9.-]*\.tar\.gz$/.test(descriptor.file) ||
    !/^[a-f0-9]{64}$/.test(descriptor.manifestSha256) || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes <= 0 || !/^[a-f0-9]{64}$/.test(descriptor.sha256) ||
    !['linux', 'win32', 'darwin'].includes(descriptor.platform) || !['x64', 'arm64'].includes(descriptor.arch) ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(descriptor.version) ||
    descriptor.file !== `eden-agent-${descriptor.platform}-${descriptor.arch}-${descriptor.version}.tar.gz`) throw new Error('Invalid release descriptor')
  return { bytes, descriptor }
}
async function assertArchive(filename, descriptor) {
  const archive = path.join(path.dirname(path.resolve(filename)), descriptor.file), info = await lstat(archive)
  if (!info.isFile() || info.size !== descriptor.bytes) throw new Error('Release archive size differs from its descriptor')
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(archive)) hash.update(bytes)
  if (hash.digest('hex') !== descriptor.sha256) throw new Error('Release archive digest differs from its descriptor')
  return archive
}
const keyId = key => createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex')
export async function signRelease(descriptorFile, privateKeyFile, signatureFile) {
  const { bytes, descriptor } = await releaseDescriptor(descriptorFile)
  await assertArchive(descriptorFile, descriptor)
  const privateKey = createPrivateKey(await boundedFile(privateKeyFile, 16384))
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Release signing requires an Ed25519 key')
  const publicKey = createPublicKey(privateKey)
  const envelope = { format: 1, algorithm: 'ed25519', keyId: keyId(publicKey), signature: sign(null, bytes, privateKey).toString('base64') }
  await writeFile(signatureFile, JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx', mode: 0o644 })
  return { keyId: envelope.keyId, file: descriptor.file }
}
export async function verifyReleaseDescriptor(descriptorFile, signatureFile, trustedPublicKeyFile) {
  const { bytes, descriptor } = await releaseDescriptor(descriptorFile)
  const envelope = JSON.parse((await boundedFile(signatureFile, 8192)).toString('utf8'))
  const publicKey = createPublicKey(await boundedFile(trustedPublicKeyFile, 16384))
  if (publicKey.asymmetricKeyType !== 'ed25519' || envelope.format !== 1 || envelope.algorithm !== 'ed25519' || envelope.keyId !== keyId(publicKey) ||
    typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature) ||
    !verify(null, bytes, publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('Release publisher signature is invalid for the supplied trusted key')
  return { manifestSha256: descriptor.manifestSha256, descriptorSha256: createHash('sha256').update(bytes).digest('hex'), platform: descriptor.platform, arch: descriptor.arch, version: descriptor.version, keyId: envelope.keyId }
}

export async function verifyRelease(descriptorFile, signatureFile, trustedPublicKeyFile) {
  const release = await verifyReleaseDescriptor(descriptorFile, signatureFile, trustedPublicKeyFile)
  const { bytes, descriptor } = await releaseDescriptor(descriptorFile)
  if (createHash('sha256').update(bytes).digest('hex') !== release.descriptorSha256) throw new Error('Release descriptor changed during verification')
  return { ...release, archive: await assertArchive(descriptorFile, descriptor) }
}
