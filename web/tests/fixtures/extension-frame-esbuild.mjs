import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { legacyFramePlugin } from '../../legacy-frame-plugin.mjs'

/** Match the production Vite frame imports when a renderer fixture bundles with esbuild. */
export function extensionFrameEsbuild() {
  const legacy = legacyFramePlugin()
  return { name: 'extension-frame-fixture', setup(build) {
    build.onResolve({ filter: /\?frame-runtime$/ }, () => ({ path: 'legacy', namespace: 'extension-frame' }))
    build.onLoad({ filter: /^legacy$/, namespace: 'extension-frame' }, async () => ({
      contents: await legacy.load('\0eden-legacy-frame-runtime'), loader: 'js',
    }))
    build.onResolve({ filter: /\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'extension-frame-raw' }))
    build.onLoad({ filter: /.*/, namespace: 'extension-frame-raw' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }))
  } }
}
