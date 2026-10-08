import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const server = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false,
  plugins: [react(), tailwindcss()], server: { host: '127.0.0.1', port: 0, hmr: false, ws: false }, appType: 'mpa' })
await server.listen()
console.log(`NOTICE_PREVIEW http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/notice-preview.html`)
const close = async () => { await server.close(); process.exit(0) }
process.on('SIGINT', close)
process.on('SIGTERM', close)
