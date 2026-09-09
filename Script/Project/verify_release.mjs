import { verifyRelease } from './release_signature.mjs'
const [descriptor, signature, trustedKey] = process.argv.slice(2)
if (process.argv.length !== 5) throw new Error('Usage: verify_release.mjs <descriptor.json> <signature.json> <trusted-public-key.pem>')
process.stdout.write(JSON.stringify(await verifyRelease(descriptor, signature, trustedKey)) + '\n')
