const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { findMonWorkspaceRoot } = require('../app/monconfig.cjs')

function workspaceIdentity(start, { fileSystem = fs, pathApi = path, platform = process.platform } = {}) {
  const root = findMonWorkspaceRoot(start, { fileSystem, pathApi })
  if (!root) return {}
  const canonical = fileSystem.realpathSync ? fileSystem.realpathSync(root) : root
  const normalized = canonical.replaceAll('\\', '/').replace(/\/$/, '')
  const key = platform === 'win32' ? normalized.toLowerCase() : normalized
  return { monWorkspaceRoot: canonical, workspaceId: createHash('sha256').update(key).digest('hex') }
}
module.exports = { workspaceIdentity }
