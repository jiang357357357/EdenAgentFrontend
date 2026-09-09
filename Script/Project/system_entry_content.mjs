import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const quoteSh = value => `'${value.replaceAll("'", "'\\''")}'`
const quotePs = value => `'${value.replaceAll("'", "''")}'`
// Desktop string unescaping runs before Exec argument unescaping.
const desktopArgument = value => `"${value.replaceAll('%', '%%').replace(/[\\"`$]/g, character => `\\${character}`).replaceAll('\\', '\\\\')}"`
const windowsArgument = value => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`

export function systemEntryName(platform = process.platform) {
  if (platform === 'linux') return 'eden-agent.desktop'
  if (platform === 'win32') return 'Eden Agent.lnk'
  if (platform === 'darwin') return 'Eden Agent.command'
  throw new Error('System entry is unsupported on this platform')
}

export async function writeSystemEntry(filename, root) {
  if (/[\x00-\x1f\x7f]/.test(root)) throw new Error('System entry path contains control characters')
  const launcher = path.join(root, 'launcher')
  const node = path.join(launcher, process.platform === 'win32' ? 'node.exe' : 'node')
  const args = [path.join(launcher, 'launch_version.mjs'), root, path.join(launcher, 'publisher.pem')]
  if (process.platform === 'linux') {
    if (node.includes('=')) throw new Error('Desktop executable path cannot contain an equals sign')
    await writeFile(filename, `[Desktop Entry]\nType=Application\nVersion=1.0\nName=Eden Agent\nComment=Start the verified Eden Agent installation\nExec=${[node, ...args].map(desktopArgument).join(' ')}\nTerminal=true\nCategories=Utility;\nStartupNotify=false\n`, { flag: 'wx', mode: 0o755 })
  } else if (process.platform === 'darwin') {
    await writeFile(filename, `#!/bin/sh\nexec ${[node, ...args].map(quoteSh).join(' ')}\n`, { flag: 'wx', mode: 0o755 })
  } else if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot
    if (!systemRoot || !path.isAbsolute(systemRoot)) throw new Error('Windows SystemRoot is unavailable')
    const powershell = path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
    const source = `$ErrorActionPreference = 'Stop'\n$link = (New-Object -ComObject WScript.Shell).CreateShortcut(${quotePs(filename)})\n$link.TargetPath = ${quotePs(node)}\n$link.Arguments = ${quotePs(args.map(windowsArgument).join(' '))}\n$link.WorkingDirectory = ${quotePs(root)}\n$link.Description = 'Start the verified Eden Agent installation'\n$link.Save()\n`
    await new Promise((resolve, reject) => {
      const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')],
        { windowsHide: true, stdio: 'ignore', env: { SystemRoot: systemRoot, WINDIR: systemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP } })
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill() }, 15000)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('close', code => { clearTimeout(timer); code === 0 && !timedOut ? resolve() : reject(new Error('Windows shortcut creation failed or timed out')) })
    })
    if (!(await readFile(filename)).length) throw new Error('Windows shortcut was not created')
  } else throw new Error('System entry is unsupported on this platform')
}
