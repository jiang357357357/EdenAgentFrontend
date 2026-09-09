const fs = require('node:fs')
const path = require('node:path')
const { readRuntimeSelection } = require('./runtime-selection.cjs')

/** Resolve both worlds together before either process starts. Single-host V2_DATA_ROOT is not a pair setting. */
function resolveRealmDataRoots(env, defaults, { pathApi = path, fileSystem = fs } = {}) {
  return resolveRealmSelection(env, defaults, { pathApi, fileSystem }).roots
}

function resolveRealmSelection(env, defaults, { pathApi = path, fileSystem = fs } = {}) {
  const selectionFile = env.EDEN_AGENT_RUNTIME_SELECTION
  const selection = selectionFile === undefined ? null : readRuntimeSelection(selectionFile, { pathApi, fileSystem })
  const roots = {}
  for (const origin of ['mon', 'local']) {
    const configured = env[`EDEN_AGENT_${origin.toUpperCase()}_DATA_ROOT`]
    if (configured !== undefined && (typeof configured !== 'string' || !configured.trim() || !pathApi.isAbsolute(configured))) {
      throw new Error(`EDEN_AGENT_${origin.toUpperCase()}_DATA_ROOT must be an absolute directory`)
    }
    if (selection && configured !== undefined && pathApi.resolve(configured) !== pathApi.resolve(selection.roots[origin])) throw new Error('Explicit data root conflicts with persistent runtime selection')
    roots[origin] = pathApi.resolve(selection?.roots[origin] ?? configured ?? defaults[origin])
  }
  function canonical(root) {
    let current = root
    const suffix = []
    if (fileSystem.realpathSync) {
      while (!fileSystem.existsSync(current)) {
        const parent = pathApi.dirname(current)
        if (parent === current) throw new Error('Cannot resolve runtime data root')
        suffix.unshift(pathApi.basename(current)); current = parent
      }
      current = pathApi.join(fileSystem.realpathSync(current), ...suffix)
    }
    return pathApi.sep === '\\' ? current.toLowerCase() : current
  }
  const mon = canonical(roots.mon), local = canonical(roots.local)
  function contains(parent, child) {
    const relative = pathApi.relative(parent, child)
    return !relative || (!relative.startsWith(`..${pathApi.sep}`) && relative !== '..' && !pathApi.isAbsolute(relative))
  }
  if (contains(mon, local) || contains(local, mon)) throw new Error('Agent worlds require separate, non-nested data directories')
  return { roots: Object.freeze(roots), selection: selection ? { filename: selectionFile, revision: selection.revision } : null }
}

module.exports = { resolveRealmDataRoots, resolveRealmSelection }
