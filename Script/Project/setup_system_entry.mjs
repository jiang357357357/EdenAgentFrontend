import { constants } from 'node:fs'
import { chmod, copyFile, lstat, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { installedVersion, readVersionSelection, withInstallationLock } from './installed_version.mjs'
import { verifyLauncher } from './launcher_integrity.mjs'
import { systemEntryName, writeSystemEntry } from './system_entry_content.mjs'

const [directory, trustedKey, destination, confirmation] = process.argv.slice(2)
if (process.argv.length !== 6 || confirmation !== '--confirm-system-entry') throw new Error('Usage: setup_system_entry.mjs <installation-dir> <trusted-public-key.pem> <existing-user-menu-or-desktop-dir> --confirm-system-entry')
await withInstallationLock(directory, async root => {
  const selected = await readVersionSelection(root)
  if (!selected) throw new Error('Select an installed version before creating a system entry')
  await installedVersion(root, selected.version, trustedKey)
  const launcher = await verifyLauncher(root, trustedKey)
  const targetDirectory = await realpath(destination)
  if (!(await lstat(targetDirectory)).isDirectory()) throw new Error('System entry destination must be a directory')
  const target = path.join(targetDirectory, systemEntryName())
  try { await lstat(target); throw new Error('System entry already exists; choose another directory or remove it explicitly') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  // Keep generation private and publish with exclusive creation; never replace an existing shortcut.
  const temporary = await mkdtemp(path.join(targetDirectory, '.eden-entry-'))
  let published = false
  try {
    await chmod(temporary, 0o700)
    const staged = path.join(temporary, systemEntryName())
    await writeSystemEntry(staged, root)
    const stat = await lstat(staged)
    if (!stat.isFile() || stat.size < 1 || stat.size > 65536) throw new Error('Invalid generated system entry')
    await copyFile(staged, target, constants.COPYFILE_EXCL)
    published = true
    if (process.platform !== 'win32') await chmod(target, 0o755)
    if (!(await readFile(target)).equals(await readFile(staged))) throw new Error('System entry changed during publication')
    process.stdout.write(JSON.stringify({ entry: target, selectedVersion: selected.version, ...launcher, started: false }) + '\n')
  } catch (error) {
    if (published) throw new Error(`System entry was created at ${target}, but finalization failed; inspect it before retrying`, { cause: error })
    throw error
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
