const fs = require('node:fs')
const path = require('node:path')

function readRuntimeSelection(filename, { fileSystem = fs, pathApi = path } = {}) {
  if (!pathApi.isAbsolute(filename)) throw new Error('Runtime selection filename must be absolute')
  const stat = fileSystem.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error('Runtime selection must be a regular JSON file of at most 64 KiB')
  const value = JSON.parse(fileSystem.readFileSync(filename, 'utf8'))
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
  if (!value || value.format !== 'eden.runtime-selection.v1' || !uuid.test(value.revision) ||
    (value.previousRevision !== null && !uuid.test(value.previousRevision)) ||
    !value.roots || typeof value.note !== 'string' || !value.note.trim() || !Number.isSafeInteger(value.createdAt)) throw new Error('Invalid runtime selection document')
  for (const origin of ['mon', 'local']) if (typeof value.roots[origin] !== 'string' || !pathApi.isAbsolute(value.roots[origin])) throw new Error('Runtime selection requires two absolute data roots')
  return value
}

module.exports = { readRuntimeSelection }
