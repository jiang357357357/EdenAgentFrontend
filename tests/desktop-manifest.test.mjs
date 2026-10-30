import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { writeDesktopManifest } from '../Script/Project/desktop_manifest.mjs'

test('parallel desktop inventory preserves deterministic order and exact file integrity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eden-manifest-integrity-'))
  try {
    for (const name of ['first', 'second']) {
      const folder = path.join(root, name)
      await mkdir(path.join(folder, 'nested'), { recursive: true })
      for (let i = 39; i >= 0; i--) await writeFile(path.join(folder, i % 2 ? 'nested' : '', `file-${i}.txt`), `content-${i}`)
      await writeDesktopManifest(folder, { platform: process.platform, arch: 'x64' })
    }
    const first = JSON.parse(await readFile(path.join(root, 'first/desktop-manifest.json')))
    const second = JSON.parse(await readFile(path.join(root, 'second/desktop-manifest.json')))
    assert.deepEqual(first, second)
    assert.equal(first.entries.length, 40)
    assert.deepEqual(first.entries.map(entry => entry.file), first.entries.map(entry => entry.file).sort())
    for (const entry of first.entries) {
      const bytes = await readFile(path.join(root, 'first', entry.file))
      assert.equal(entry.bytes, bytes.length)
      assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'))
    }
  } finally { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); await rm(root, { recursive: true, force: true }) }
})

test('inventory rejects a directory link outside the distribution and writes no success manifest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eden-manifest-boundary-'))
  try {
    const app = path.join(root, 'app'), outside = path.join(root, 'outside')
    await mkdir(app); await mkdir(outside); await writeFile(path.join(outside, 'proof.txt'), 'outside')
    await writeFile(path.join(app, 'normal.txt'), 'normal')
    await symlink(outside, path.join(app, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(writeDesktopManifest(app, { platform: process.platform }), /escapes the distribution/)
    await assert.rejects(access(path.join(app, 'desktop-manifest.json')), { code: 'ENOENT' })
    assert.equal(await readFile(path.join(outside, 'proof.txt'), 'utf8'), 'outside')
  } finally { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); await rm(root, { recursive: true, force: true }) }
})
