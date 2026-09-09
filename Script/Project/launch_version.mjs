import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { installedVersion, readVersionSelection, withInstallationLock } from './installed_version.mjs'
const [directory, trustedKey] = process.argv.slice(2)
if (process.argv.length !== 4) throw new Error('Usage: launch_version.mjs <installation-dir> <trusted-public-key.pem>')
await withInstallationLock(directory, async (root, lock) => {
  const selection = await readVersionSelection(root)
  if (!selection) throw new Error('Select an installed version first')
  const token = randomUUID()
  await lock.writeFile(JSON.stringify({ kind: 'desktop-launch', pid: process.pid, token, revision: selection.revision }) + '\n')
  await lock.sync()
  for (;;) {
    const current = await readVersionSelection(root)
    if (current?.revision !== selection.revision) throw new Error('Installed selection changed while the launcher was active')
    const { executable } = await installedVersion(root, selection.version, trustedKey)
    const restart = await new Promise((resolve, reject) => {
      let requested = false
      const child = spawn(executable, [], { cwd: path.dirname(executable), stdio: ['inherit', 'inherit', 'inherit', 'ipc'], shell: false,
        env: { ...process.env, EDEN_AGENT_INSTALLATION_ROOT: root, EDEN_AGENT_INSTALLATION_REVISION: selection.revision, EDEN_AGENT_LAUNCH_TOKEN: token } })
      child.on('message', value => { if (value?.type === 'eden.desktop.restart' && value.token === token) requested = true })
      child.once('error', reject)
      // A restart request never skips Electron's normal shutdown of both hosts.
      child.once('exit', (code, signal) => code === 0 ? resolve(requested) : reject(new Error(`Installed desktop exited: ${signal ?? code}`)))
    })
    if (!restart) break
  }
})
