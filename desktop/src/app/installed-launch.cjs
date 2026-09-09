const fs = require('node:fs')
const path = require('node:path')

function readRecord(filename) {
  const info = fs.lstatSync(filename)
  if (!info.isFile() || info.size > 16384) throw new Error('Invalid installed launch record')
  return JSON.parse(fs.readFileSync(filename, 'utf8'))
}
function installedLocation(executable) {
  const appDirectory = process.platform === 'darwin' ? path.resolve(path.dirname(executable), '../../..') : path.dirname(executable)
  const versionDirectory = path.dirname(appDirectory)
  if (path.basename(appDirectory) !== 'app' || path.basename(path.dirname(versionDirectory)) !== 'versions') return null
  return { appDirectory, versionDirectory, root: path.dirname(path.dirname(versionDirectory)) }
}

/** Coordination for managed installations, not an OS security boundary against the account owner. */
function assertInstalledLaunch(executable = process.execPath) {
  const location = installedLocation(executable)
  if (!location) {
    if (process.env.EDEN_AGENT_INSTALLATION_ROOT) throw new Error('Managed launcher does not match this application location')
    return false
  }
  const receipt = readRecord(path.join(location.versionDirectory, 'installation.json'))
  const root = fs.realpathSync(location.root)
  if (process.env.EDEN_AGENT_INSTALLATION_ROOT !== root || !process.env.EDEN_AGENT_LAUNCH_TOKEN || typeof process.send !== 'function') throw new Error('This installed version must be started through launch_version.mjs')
  const selection = readRecord(path.join(root, 'current-version.json'))
  const lock = readRecord(path.join(root, '.install.lock'))
  if (receipt.format !== 1 || receipt.platform !== process.platform || receipt.arch !== process.arch ||
    selection.version !== path.basename(location.versionDirectory) || selection.revision !== process.env.EDEN_AGENT_INSTALLATION_REVISION ||
    lock.kind !== 'desktop-launch' || lock.token !== process.env.EDEN_AGENT_LAUNCH_TOKEN || lock.revision !== selection.revision || lock.pid !== process.ppid) throw new Error('Installed launch selection or owner changed; restart through the managed launcher')
  return true
}
function restartInstalledDesktop(app) {
  if (!process.env.EDEN_AGENT_INSTALLATION_ROOT) { app.relaunch(); app.quit(); return }
  assertInstalledLaunch()
  process.send({ type: 'eden.desktop.restart', token: process.env.EDEN_AGENT_LAUNCH_TOKEN }, error => {
    if (error) { console.error('Unable to request managed desktop restart'); return }
    app.quit()
  })
}
module.exports = { assertInstalledLaunch, restartInstalledDesktop }
