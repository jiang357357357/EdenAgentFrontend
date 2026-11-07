import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { isolatedBrowser, until } from '../../../Script/Test/browser-cdp.mjs'

test('the real compaction cards preserve progress, replace it with a result and replay consistently', { timeout: 90_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'eden-compaction-display-'))
  assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()))
  let browser, server
  try {
    server = await createServer({ cacheDir: path.join(root, 'vite-cache'),
      server: { host: '127.0.0.1', port: 0, open: false },
      plugins: [{ name: 'isolated-compaction-display', configureServer(vite) {
        vite.middlewares.use('/__compaction_display', async (_request, response) => {
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.end(await vite.transformIndexHtml('/__compaction_display', '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/compaction-display-renderer.tsx"></script></body></html>'))
        })
      } }],
    })
    await server.listen()
    browser = await isolatedBrowser(path.join(root, 'browser'))
    await browser.command('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/__compaction_display` })
    await until(() => browser.evaluate('typeof window.runCompactionDisplayChecks === "function"'), 60_000)
    const result = await browser.evaluate('window.runCompactionDisplayChecks()')
    assert.equal(result.passed, true)
    assert.deepEqual(browser.errors, [])
    const evidence = fileURLToPath(new URL('../../../../.run/logs/', import.meta.url))
    await writeFile(path.join(evidence, 'compaction-display-browser.json'), JSON.stringify({ ...result, browserExceptions: browser.errors }, null, 2))
    const screenshot = await browser.command('Page.captureScreenshot', { format: 'png' })
    await writeFile(path.join(evidence, 'compaction-display-browser.png'), Buffer.from(screenshot.data, 'base64'))
  } catch (error) {
    console.error(JSON.stringify({ browserExceptions: browser?.errors }))
    throw error
  } finally {
    await browser?.close(); await server?.close()
    await rm(root, { recursive: true, force: true })
  }
})
