import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const { MarkdownContent } = await vite.ssrLoadModule('/src/components/chat/message/MarkdownContent.tsx')
const { MessageBubble } = await vite.ssrLoadModule('/src/components/chat/message/MessageBubble.tsx')
const render = (content, options = {}) => renderToStaticMarkup(createElement(MarkdownContent, { content, ...options }))

test('the screenshot list renders emphasis starting with a Chinese quote after Chinese text', () => {
  const content = '- 但作为主要OS时，我能取得让基沃托斯居民束手无策的**「圣所塔」 支配权**——虽然权限后来马上按老师的意思移交给了联邦学生会\n- 初登场于主线剧情 Vol.0 序章'
  const html = render(content, { separateActionLines: true })
  assert.match(html, /<strong>「圣所塔」 支配权<\/strong>/)
  assert.equal((html.match(/<li>/g) ?? []).length, 2)
  assert.doesNotMatch(html, /\*\*/)
})

test('CJK punctuation at either emphasis boundary renders without injecting spaces', () => {
  for (const [source, expected] of [
    ['使用**「圣所塔」**权限', '「圣所塔」'],
    ['这是**“重要内容”**需要牢记', '“重要内容”'],
    ['这是**（重点）**说明', '（重点）'],
    ['这是**重要内容。**后面的内容', '重要内容。'],
    ['甲**「一」**乙**（二）**丙', '「一」'],
  ]) assert.ok(render(source).includes(`<strong>${expected}</strong>`), source)
  assert.equal(render('使用**「圣所塔」**权限').replace(/<[^>]*>/g, ''), '使用「圣所塔」权限')
})

test('emphasis can include links, inline code and nested italic text in Chinese sentences', () => {
  assert.match(render('使用**[「圣所塔」](https://example.com/tower)**权限'), /<strong><a [^>]*>「圣所塔」<\/a><\/strong>/)
  assert.match(render('使用**`「圣所塔」`**权限'), /<strong><code [^>]*>「圣所塔」<\/code><\/strong>/)
  assert.match(render('使用**「*圣所塔*」**权限'), /<strong>「<em [^>]*>圣所塔<\/em>」<\/strong>/)
})

test('assistant content and ordered text segments use the same CJK renderer and preserve raw output', () => {
  const content = '使用**「圣所塔」**权限'
  const base = { id: 'fixture-reply', role: 'assistant', timestamp: '12:00', content }
  for (const message of [base, { ...base, segments: [{ id: 'text', type: 'text', state: 'done', content }] }]) {
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    assert.match(html, /<strong>「圣所塔」<\/strong>/)
    assert.match(html, /原始输出/)
    assert.ok(html.includes(content), 'Stored/raw output must retain the original stars')
  }
})

test('incomplete streaming delimiters remain literal until the matching stars arrive', () => {
  assert.doesNotMatch(render('使用**「圣所塔」'), /<strong>/)
  assert.match(render('使用**「圣所塔」**'), /<strong>「圣所塔」<\/strong>/)
  assert.match(render('使用**「圣所塔」**权限'), /<strong>「圣所塔」<\/strong>/)
})

test('escaped markers and code retain literal stars', () => {
  for (const content of ['使用\\*\\*「圣所塔」\\*\\*权限', '`使用**「圣所塔」**权限`', '```text\n使用**「圣所塔」**权限\n```']) {
    const html = render(content, { separateActionLines: true })
    assert.doesNotMatch(html, /<strong>/)
    assert.ok(html.includes('**「圣所塔」**'))
  }
})

test('English emphasis, GFM tables and strike-through keep working', () => {
  assert.match(render('A **bold** word and *italic*.'), /<strong>bold<\/strong>/)
  assert.doesNotMatch(render('foo**(bar)**baz'), /<strong>/)
  const table = render('| 项目 | 状态 |\n| --- | --- |\n| 使用**「圣所塔」**权限 | ~~旧~~ 新 |')
  assert.match(table, /<table /)
  assert.match(table, /<strong>「圣所塔」<\/strong>/)
  assert.match(table, /<del>旧<\/del>/)
})

test('standalone action descriptions and user plaintext retain their existing rendering', () => {
  assert.match(render('*点头*\n\n使用**「圣所塔」**权限', { separateActionLines: true }), />点头<\/p>/)
  const html = renderToStaticMarkup(createElement(MessageBubble, { message: {
    id: 'fixture-user', role: 'user', timestamp: '12:00', content: '使用**「圣所塔」**权限',
  } }))
  assert.doesNotMatch(html, /<strong>/)
  assert.ok(html.includes('**「圣所塔」**'))
})
