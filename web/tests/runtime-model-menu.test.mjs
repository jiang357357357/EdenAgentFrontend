import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { mapBoundRuntimeModels } from '../src/lib/runtime-models.ts'

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
const { ModelSelectionMenu } = await vite.ssrLoadModule('/src/components/chat/input/ModelSelectionMenu.tsx')
after(() => vite.close())
const config = mapBoundRuntimeModels({ id: 'deepseek-chat', aiEntityId: 42, provider: 'deepseek', label: 'DeepSeek 测试', source: 'core', available: true })
const render = value => renderToStaticMarkup(createElement(ModelSelectionMenu, { config: value, submitting: null, overlay: false, onSelect() { throw new Error('Unexpected selection while rendering') } }))

test('busy model menus show the current binding and disable selection with a Chinese explanation', () => {
  const html = render(config)
  assert.match(html, /DeepSeek 测试/)
  assert.match(html, /显示当前使用的模型；结束后可切换/)
  assert.match(html, /role="menuitemradio"[^>]*disabled=""/)
  assert.doesNotMatch(html, /become idle/)
})

test('an idle refreshed catalogue restores selectable model buttons', () => {
  const html = render({ ...config, readOnly: false })
  assert.doesNotMatch(html, /disabled=""|显示当前使用的模型/)
  assert.match(html, /DeepSeek 测试/)
})
