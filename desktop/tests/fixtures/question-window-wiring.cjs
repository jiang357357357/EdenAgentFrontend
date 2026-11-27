const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createQuestionWindowController } = require('../../src/windows/question-window.cjs')

// Execute the actual composition expression from main.cjs. Supplying an
// independent quitting callback here would hide missing entrypoint bindings.
function createQuestionControllerFromMain(dependencies) {
  const filename = path.resolve(__dirname, '../../src/main.cjs')
  const source = readFileSync(filename, 'utf8')
  const declaration = 'const questionWindowController = '
  const start = source.indexOf(declaration)
  const end = source.indexOf('\n})', start)
  assert.ok(start >= 0 && end > start, 'the production decision-window composition must exist')
  const context = {
    createQuestionWindowController,
    BrowserWindow: dependencies.BrowserWindow,
    screen: dependencies.screen,
    path,
    __dirname: path.dirname(dependencies.preload),
    quitFlagController: dependencies.quitFlagController,
    resolveWindowIcon: dependencies.resolveIcon,
    loadWebApp: (window, role) => {
      assert.equal(role, 'question')
      return dependencies.load(window)
    },
    attachRendererDiagnostics: dependencies.attach,
    attachWindowActivityEvents: () => {},
  }
  Object.defineProperty(context, 'isQuitting', { get: dependencies.quitting })
  Object.defineProperty(context, 'mainWindow', { get: () => {
    const webContents = dependencies.owner()
    return webContents ? { webContents } : null
  } })
  return vm.runInNewContext(source.slice(start + declaration.length, end + 3), context, { filename, timeout: 1000 })
}

module.exports = { createQuestionControllerFromMain }
