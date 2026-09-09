import { readVersionSelection, selectInstalledVersion, withInstallationLock } from './installed_version.mjs'
const [action, directory, version, expectedRevision, trustedKey, note, confirmation] = process.argv.slice(2)
if (action === 'read' && process.argv.length === 4) {
  process.stdout.write(JSON.stringify(await withInstallationLock(directory, readVersionSelection)) + '\n')
} else if (['select', 'rollback'].includes(action) && process.argv.length === 9 && confirmation === '--confirm-version') {
  const result = await withInstallationLock(directory, async root => {
    const current = await readVersionSelection(root)
    const target = action === 'rollback' ? current?.previous : version
    if (!target || action === 'rollback' && version !== target) throw new Error('Requested rollback is not the recorded previous version')
    return selectInstalledVersion(root, target, expectedRevision, trustedKey, note)
  })
  process.stdout.write(JSON.stringify(result) + '\n')
} else throw new Error('Usage: select_version.mjs read <installation-dir> | <select|rollback> <installation-dir> <version-dir-name> <expected-revision|none> <trusted-key.pem> <note> --confirm-version')
