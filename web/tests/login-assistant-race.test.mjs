import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

// Execute the application's real login handler without mounting unrelated workbench services.
const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let loginHandler
function findHandler(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleLogin' && node.initializer)
    loginHandler = `const handleLogin = ${node.initializer.getText(source)}`
  ts.forEachChild(node, findHandler)
}
findHandler(source)
assert.ok(loginHandler, 'App must expose its production login handler')
const compiled = ts.transpileModule(loginHandler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function fixture(loginWithCore) {
  const state = { user: { id: 2 }, status: 'unauthenticated', assistant: null, error: undefined, authenticating: false, resets: 0 }
  const bindings = {
    loginWithCore: (...args) => loginWithCore(state, ...args),
    setCurrentUser: value => { state.user = value },
    setAuthStatus: value => { state.status = value },
    setIsAuthenticating: value => { state.authenticating = value },
    setAuthError: value => { state.error = value },
    setCurrentAssistant: value => { state.assistant = value },
    setCurrentAssistantError: () => {},
    resetSessionRuntime: () => { state.resets++ },
    reportAuthError: (_stage, error) => error.message,
  }
  const handleLogin = new Function(...Object.keys(bindings), `${compiled}\nreturn handleLogin`)(...Object.values(bindings))
  return { state, handleLogin }
}

test('desktop authentication can load the assistant before the login profile finishes', async () => {
  let finishProfile
  const profile = new Promise(resolve => { finishProfile = resolve })
  const assistant = { id: 4, name: '普拉娜' }
  const { state, handleLogin } = fixture(async current => {
    // core_login broadcasts authentication before loginWithCore awaits the profile request.
    current.status = 'authenticated'
    current.assistant = assistant
    return profile
  })
  const pending = handleLogin('fixture-user', 'fixture-password')
  assert.equal(state.assistant, assistant)
  finishProfile({ user: { id: 2 } })
  await pending
  assert.equal(state.assistant, assistant, 'late login completion must preserve the already loaded assistant')
  assert.equal(state.status, 'authenticated')
  assert.equal(state.authenticating, false)
  assert.equal(state.resets, 1)
})

test('failed login still leaves the login form available and reports the failure', async () => {
  const { state, handleLogin } = fixture(async () => { throw new Error('登录失败') })
  await handleLogin('fixture-user', 'fixture-password')
  assert.equal(state.status, 'unauthenticated')
  assert.equal(state.error, '登录失败')
  assert.equal(state.authenticating, false)
})
