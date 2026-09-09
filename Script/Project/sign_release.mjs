import { signRelease } from './release_signature.mjs'
const [descriptor, privateKey, signature, confirmation] = process.argv.slice(2)
if (process.argv.length !== 6 || confirmation !== '--confirm-sign') throw new Error('Usage: sign_release.mjs <descriptor.json> <private-key.pem> <new-signature.json> --confirm-sign')
process.stdout.write(JSON.stringify(await signRelease(descriptor, privateKey, signature)) + '\n')
