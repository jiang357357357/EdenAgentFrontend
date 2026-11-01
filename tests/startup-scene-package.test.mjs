import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { startupSceneContract, startupSceneFiles, snapshotStartupScene, installStartupScene, stageDesktopWeb, verifyDesktopStartupScene } from '../Script/Project/startup_scene.mjs'
import { writeDesktopManifest } from '../Script/Project/desktop_manifest.mjs'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=', 'base64')
const sha = data => createHash('sha256').update(data).digest('hex')
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eden-scene-package-'))
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); await rm(root, { recursive: true, force: true }) })
  const source = path.join(root, 'external-resources')
  await mkdir(source)
  for (const name of startupSceneFiles) {
    const model = name.endsWith('.atlas') ? name.slice(0, -6) : undefined
    const content = model ? startupSceneContract.models[model].map(page => `${page}\nsize: 1,1\nfilter: Linear,Linear\n`).join('\n')
      : name.endsWith('.png') ? png : `Synthetic test resource: ${name}\n`
    await writeFile(path.join(source, name), content)
  }
  const manifest = { schemaVersion: 1, resourceId: 'agent-startup-scene', version: 'fixture-1', localOnly: false,
    files: await Promise.all(startupSceneFiles.map(async name => {
      const bytes = await readFile(path.join(source, name)); return { name, bytes: bytes.length, sha256: sha(bytes) }
    })) }
  const save = () => writeFile(path.join(source, 'manifest.json'), JSON.stringify(manifest))
  await save()
  return { root, source, manifest, save }
}

for (const platform of ['win32', 'linux']) test(`external scene survives ${platform} desktop staging and manifest inventory`, async t => {
  const { root, source } = await fixture(t), app = path.join(root, platform)
  // A clean web build has no ignored developer assets. The external pack is sufficient.
  const web = path.join(app, 'resources/app/web/dist'), cleanWeb = path.join(root, 'clean-web')
  await mkdir(cleanWeb); await writeFile(path.join(cleanWeb, 'index.html'), '<!doctype html>')
  const snapshot = await snapshotStartupScene(source)
  await stageDesktopWeb(cleanWeb, web, snapshot)
  const startupScene = await verifyDesktopStartupScene(app, platform)
  await writeDesktopManifest(app, { platform, startupScene })
  const inventory = JSON.parse(await readFile(path.join(app, 'desktop-manifest.json')))
  assert.equal(startupScene.fileCount, startupSceneFiles.length + 1)
  assert.equal(inventory.entries.filter(entry => entry.file.includes('/startup-scene/')).length, startupScene.fileCount)
  assert.deepEqual(await verifyDesktopStartupScene(app, platform, startupScene), startupScene)
  for (const [name, bytes] of snapshot.files) assert.deepEqual(await readFile(path.join(web, 'startup-scene', name)), bytes)
})

test('external resources replace the entire developer scene subtree', async t => {
  const { root, source } = await fixture(t), web = path.join(root, 'developer-web'), target = path.join(root, 'app')
  await mkdir(path.join(web, 'startup-scene'), { recursive: true })
  await writeFile(path.join(web, 'index.html'), '<!doctype html>')
  await writeFile(path.join(web, 'startup-scene/private.txt'), 'must not be packaged')
  const snapshot = await snapshotStartupScene(source)
  await stageDesktopWeb(web, target, snapshot)
  assert.deepEqual((await snapshotStartupScene(path.join(target, 'startup-scene'))).record, snapshot.record)
  await assert.rejects(readFile(path.join(target, 'startup-scene/private.txt')), { code: 'ENOENT' })
})

test('captured bytes prevent later source changes from entering the package', async t => {
  const { root, source } = await fixture(t), snapshot = await snapshotStartupScene(source)
  await writeFile(path.join(source, 'arona_spr.skel'), 'changed after capture')
  const target = path.join(root, 'captured')
  await installStartupScene(snapshot, target)
  assert.deepEqual((await snapshotStartupScene(target)).record, snapshot.record)
})

test('local-only resource pack is rejected without a staged output', async t => {
  const { root, source, manifest, save } = await fixture(t)
  manifest.localOnly = true; await save()
  await assert.rejects(snapshotStartupScene(source), /localOnly/)
  await assert.rejects(readFile(path.join(root, 'output/manifest.json')), { code: 'ENOENT' })
})

test('missing scene source has an actionable build error', async t => {
  const { root } = await fixture(t)
  await assert.rejects(snapshotStartupScene(path.join(root, 'missing')), /EDEN_AGENT_STARTUP_SCENE_SOURCE/)
})

for (const name of ['arona_spr.skel', 'arona_workpage_nighttime_2_2.png', 'DISTRIBUTION-NOTICE.txt', 'LICENSE.txt'])
  test(`missing required resource cannot be hidden by editing the manifest: ${name}`, async t => {
    const { source, manifest, save } = await fixture(t)
    manifest.files = manifest.files.filter(entry => entry.name !== name); await rm(path.join(source, name)); await save()
    await assert.rejects(snapshotStartupScene(source), /required resource missing/)
  })

test('tampered texture fails its declared integrity check', async t => {
  const { source } = await fixture(t)
  await writeFile(path.join(source, 'arona_spr.png'), Buffer.concat([png, Buffer.from('tamper')]))
  await assert.rejects(snapshotStartupScene(source), /size\/SHA-256 mismatch/)
})

test('atlas references are checked even when its digest is updated', async t => {
  const { source, manifest, save } = await fixture(t)
  const bytes = Buffer.from('outside.png\nsize: 1,1\n')
  await writeFile(path.join(source, 'arona_spr.atlas'), bytes)
  Object.assign(manifest.files.find(entry => entry.name === 'arona_spr.atlas'), { bytes: bytes.length, sha256: sha(bytes) }); await save()
  await assert.rejects(snapshotStartupScene(source), /atlas texture pages disagree/)
})

test('unlisted files and unsafe manifest paths never enter customer resources', async t => {
  const { source, manifest, save } = await fixture(t)
  await writeFile(path.join(source, '.env'), 'fixture=private')
  await assert.rejects(snapshotStartupScene(source), /unlisted/)
  await rm(path.join(source, '.env'))
  manifest.files[0].name = '../escape.txt'; await save()
  await assert.rejects(snapshotStartupScene(source), /unsafe/)
})

test('resource names cannot collide on Windows when prepared on Linux', async t => {
  const { source, manifest, save } = await fixture(t)
  manifest.files.push({ ...manifest.files.find(entry => entry.name === 'LICENSE.txt'), name: 'license.txt' })
  await save()
  await assert.rejects(snapshotStartupScene(source), /duplicate/)
})

test('a linked resource directory cannot read from a developer folder', async t => {
  const { root, source } = await fixture(t), link = path.join(root, 'linked')
  await symlink(source, link, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(snapshotStartupScene(link), /regular directory/)
})

test('packaged-resource metadata cannot claim a different source', async t => {
  const { root, source } = await fixture(t), web = path.join(root, 'app/resources/app/web/dist')
  await mkdir(web, { recursive: true }); await installStartupScene(await snapshotStartupScene(source), path.join(web, 'startup-scene'))
  const record = await verifyDesktopStartupScene(path.join(root, 'app'), 'win32')
  await assert.rejects(verifyDesktopStartupScene(path.join(root, 'app'), 'win32', { ...record, manifestSha256: 'a'.repeat(64) }), /differ/)
})

test('preparation preserves source notices and requires a delivery notice for deliverable output', async t => {
  const { root, source, manifest } = await fixture(t), upstream = path.join(root, 'upstream')
  await mkdir(path.join(upstream, 'assets'), { recursive: true })
  for (const entry of manifest.files) {
    const notice = startupSceneContract.notices.includes(entry.name)
    await writeFile(path.join(upstream, notice ? '' : 'assets', entry.name), await readFile(path.join(source, entry.name)))
  }
  const script = fileURLToPath(new URL('../../Script/Project/prepare_startup_scene.mjs', import.meta.url))
  const target = path.join(root, 'prepared')
  const result = spawnSync(process.execPath, [script, '--source', upstream, '--output', target, '--version', 'fixture-2',
    '--distribution-notice', path.join(source, 'DISTRIBUTION-NOTICE.txt')], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal((await snapshotStartupScene(target)).record.version, 'fixture-2')
  assert.deepEqual(await readFile(path.join(target, 'LICENSE.txt')), await readFile(path.join(source, 'LICENSE.txt')))
})
