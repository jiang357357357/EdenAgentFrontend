import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
const {projectSessionEvent,apiSession}=await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
const {runtimeReducer,initialRuntimeState}=await vite.ssrLoadModule('/src/lib/session-reducer.ts')
const {TokenMeter}=await vite.ssrLoadModule('/src/components/chat/input/ChatInputControls.tsx')
after(()=>vite.close())
test('model response flows into session usage and reload mapping preserves unknown categories', () => {
  const projected=projectSessionEvent({id:'event',sessionId:'session',turnId:'turn',eventType:'model.response',createdAt:1,payload:{usage:{input:100,cacheRead:900,cacheWrite:0,output:50}}})
  const state=runtimeReducer(initialRuntimeState,{type:'event',event:projected[0]})
  assert.equal(state.sessions.session.contextTokens,1050)
  const hydrated=apiSession({id:'session',title:'',runtimeOrigin:'mon',createdAt:1,updatedAt:1,participants:[],contextTokens:1050,tokenBreakdown:state.sessions.session.tokenBreakdown})
  assert.equal(hydrated.tokenBreakdown.character,undefined)
  assert.equal(hydrated.tokenBreakdown.cacheRead,900)
})
test('empty input does not make the context meter zero and unknown details stay unknown', () => {
  const html=renderToStaticMarkup(createElement(TokenMeter,{inputTokens:0,contextTokens:32000,contextWindow:128000,breakdown:{providerInput:31000,providerOutput:1000}})).replace(/<!--.*?-->/g,'')
  assert.match(html,/>25%<\/span>/)
  assert.match(html,/未提供/)
  assert.match(html,/最近请求输入/)
})

test('estimated categories survive live projection and cache percentage is not rounded to 100', () => {
  const projected = projectSessionEvent({ id: 'e', sessionId: 's', turnId: 't', eventType: 'model.response', createdAt: 1,
    payload: { contextEstimate: { character: 100, skills: 25, system: 50, tools: 40, history: 90, promptCacheEpoch: 1, promptCacheInvalidationReason: 'stable' },
      usage: { input: 431, cacheRead: 92032, cacheWrite: 0, output: 2223 } } })
  const state = runtimeReducer(initialRuntimeState, { type: 'event', event: projected[0] })
  assert.equal(state.sessions.s.tokenBreakdown.character, 100)
  const html = renderToStaticMarkup(createElement(TokenMeter, { inputTokens: 0, contextTokens: 94686, contextWindow: 128000, breakdown: state.sessions.s.tokenBreakdown })).replace(/<!--.*?-->/g, '')
  assert.match(html, /99.53%/)
  assert.match(html, /角色人设（估算）/)
  assert.match(html, /本地前缀/)
})
