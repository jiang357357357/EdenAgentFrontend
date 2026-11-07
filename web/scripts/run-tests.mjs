import { readdir, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

// tsx resolves frontend extensionless imports; Vite's in-process SSR runner must use Node's loader.
const directory = path.resolve('tests')
const available = (await readdir(directory)).filter(name => name.endsWith('.test.mjs')).sort()
const requested = process.argv.slice(2).map(value => path.basename(value))
if (requested.some(name => !available.includes(name))) throw new Error('Requested web test was not found')
const files = requested.length ? [...new Set(requested)] : available
const groups = { vite: [], standard: [], visual: [] }
for (const file of files) {
  const source = await readFile(path.join(directory, file), 'utf8')
  const group = /^(?:startup-.*-renderer|workbench-spine-resize-renderer)\.test\.mjs$/.test(file) ? groups.visual
    : /(?:from\s*|import\s*\()(['"])vite\1/.test(source) ? groups.vite : groups.standard
  group.push(path.join('tests', file))
}
let failed = false
for (const [name, args] of [['standard', ['--import', 'tsx']], ['vite', ['--experimental-transform-types']], ['visual', ['--import', 'tsx']]]) {
  if (!groups[name].length) continue
  const result = spawnSync(process.execPath, [...args, '--test', `--test-concurrency=${name === 'visual' ? 1 : 2}`, ...groups[name]], { stdio: 'inherit' })
  if (result.error) { console.error(result.error); failed = true }
  if (result.status !== 0) failed = true
}
if (failed) process.exitCode = 1
