import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

/** Bundle React into the isolated document; no application modules or tokens enter the frame.
 * @returns {import('vite').Plugin}
 */
export function legacyFramePlugin() {
  let runtime
  return { name: 'eden-legacy-frame-runtime', enforce: 'pre',
    resolveId(id) { if (id.endsWith('?frame-runtime')) return '\0eden-legacy-frame-runtime' },
    async load(id) {
      if (id !== '\0eden-legacy-frame-runtime') return
      runtime ??= build({ entryPoints: [fileURLToPath(new URL('./src/lib/extensions/legacy-frame-runtime.ts', import.meta.url))],
        bundle: true, write: false, format: 'iife', globalName: 'EdenLegacyFrame', platform: 'browser', minify: true,
        define: { 'process.env.NODE_ENV': '"production"' } }).then(result => result.outputFiles[0].text)
      return `export default ${JSON.stringify(await runtime)}`
    },
  }
}
