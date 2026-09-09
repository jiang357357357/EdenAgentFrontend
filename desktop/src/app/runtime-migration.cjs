const { restartInstalledDesktop } = require('./installed-launch.cjs')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { readRuntimeSelection } = require('../processes/runtime-selection.cjs')

function createRuntimeMigration({ app, dialog, manager, agentRoot, getMainWindow }) {
  const filename = process.env.EDEN_AGENT_RUNTIME_SELECTION || path.join(app.getPath('userData'), 'runtime-selection.json')
  let busy = false
  function current() {
    try { return readRuntimeSelection(filename) }
    catch (error) { if (error.code === 'ENOENT') return null; throw error }
  }
  function trusted(event) {
    const window = getMainWindow()
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Runtime switching is available only in the main application window')
    return window
  }
  function run(args) {
    const script = app.isPackaged ? path.join(process.resourcesPath, 'migration/select-runtime.mjs') : path.join(agentRoot, 'Script/Project/select_runtime.mjs')
    const commandArgs = app.isPackaged ? [script, ...args] : ['--import', 'tsx', script, ...args]
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
    if (!app.isPackaged && !process.env.EDEN_AGENT_NODE_PATH) env.ELECTRON_RUN_AS_NODE = '1'
    return new Promise((resolve, reject) => {
      const child = spawn(manager.executablePath(), commandArgs, { cwd: agentRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
      let output = '', errors = '', total = 0, failure
      const timer = setTimeout(() => { failure = new Error('Offline runtime selection timed out; inspect its saved revision before retrying'); child.kill() }, 120000)
      const append = (buffer, error) => {
        total += buffer.length
        if (total > 1024 * 1024) { failure = new Error('Offline selection output exceeded its limit'); child.kill(); return }
        if (error) errors += buffer.toString(); else output += buffer.toString()
      }
      child.stdout.on('data', value => append(value, false)); child.stderr.on('data', value => append(value, true))
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('close', code => {
        clearTimeout(timer)
        if (failure || code !== 0) { reject(failure || new Error(errors || `Offline selection exited ${code}`)); return }
        try { resolve(JSON.parse(output)) } catch (error) { reject(error) }
      })
    })
  }
  async function change(event, restore) {
    const window = trusted(event)
    if (busy) throw new Error('A runtime selection operation is already in progress')
    if (['mon', 'local'].some(origin => manager.status(origin).externallyManaged)) throw new Error('This desktop does not own both worlds. Stop the external launchers and use the offline selection command.')
    if (['EDEN_AGENT_MON_DATA_ROOT', 'EDEN_AGENT_LOCAL_DATA_ROOT', 'EDEN_AGENT_V2_DATA_ROOT', 'EDEN_AGENT_MON_TOKEN_FILE', 'EDEN_AGENT_LOCAL_TOKEN_FILE', 'EDEN_AGENT_TOKEN_FILE'].some(key => process.env[key])) throw new Error('Explicit launch directory/token overrides are active. Update those through the offline workflow before using desktop switching.')
    busy = true
    try {
      const prior = current()
      if (restore && !prior?.previousRevision) throw new Error('No previous runtime selection is available')
      const roots = {}
      if (!restore) for (const origin of ['mon', 'local']) {
        const selected = await dialog.showOpenDialog(window, { title: `选择${origin === 'mon' ? '伊甸园' : '尘世'}已激活的数据目录`, properties: ['openDirectory'] })
        if (selected.canceled) return { cancelled: true }
        roots[origin] = selected.filePaths[0]
      }
      const decision = await dialog.showMessageBox(window, { type: 'warning', buttons: ['取消', '停止两个世界并切换'], defaultId: 0, cancelId: 0,
        message: restore ? '恢复上一版双世界启动目录？' : '切换双世界启动目录？',
        detail: `${restore ? '使用已保存的上一版目录。' : `伊甸园：${roots.mon}\n尘世：${roots.local}`}\n会停止当前两个宿主，进行离线核对。成功后需要重启桌面；失败后也应重启以恢复服务。不会迁移或删除文件。` })
      if (decision.response !== 1) return { cancelled: true }
      await manager.stop()
      fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 })
      let selected = prior
      if (!selected) {
        const original = manager.dataRoots()
        selected = await run(['select', filename, 'none', original.mon, original.local, '桌面保存切换前启动目录', '--confirm-switch'])
      }
      const result = restore ? await run(['restore', filename, selected.revision, '桌面明确恢复上一版启动目录', '--confirm-switch']) :
        await run(['select', filename, selected.revision, roots.mon, roots.local, '桌面明确切换双世界启动目录', '--confirm-switch'])
      return { changed: true, revision: result.revision, roots: result.roots, restartRequired: true }
    } finally { busy = false }
  }
  return {
    runtime_migration_read: ({ event }) => { trusted(event); return { selection: current(), roots: manager.dataRoots(), busy, externallyManaged: ['mon', 'local'].some(origin => manager.status(origin).externallyManaged) } },
    runtime_migration_select: ({ event }) => change(event, false),
    runtime_migration_restore: ({ event }) => change(event, true),
    runtime_migration_restart: ({ event }) => { trusted(event); if (busy) throw new Error('Wait for runtime selection to finish'); restartInstalledDesktop(app); return { restarting: true } },
  }
}

module.exports = { createRuntimeMigration }
