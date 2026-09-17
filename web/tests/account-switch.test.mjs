import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const previous = {window:globalThis.window,document:globalThis.document,WebSocket:globalThis.WebSocket}
const values=new Map([['agent.runtime_origin','mon'],['agent.auth_token','account-a']])
const browser=new EventTarget()
browser.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}
browser.location={origin:'http://127.0.0.1:40091',href:'http://127.0.0.1:40091/'}
browser.edenAgentDesktop={getAgentCapability:async()=>({token:'x'.repeat(43),baseUrl:'http://127.0.0.1:40092'})}
globalThis.window=browser
globalThis.document={documentElement:{dataset:{}}}
const sockets=[]
class Socket extends EventTarget {
 static OPEN=1
 readyState=1
 requests=[]
 constructor(){super();sockets.push(this);queueMicrotask(()=>this.dispatchEvent(new Event('open')))}
 send(raw){
  const request=JSON.parse(raw);this.requests.push(request)
  if(request.method==='initialize')this.reply(request,{protocolVersion:2,serverName:'fixture',serverVersion:'2',agentCoreVersion:'pi',runtimeOrigin:'mon',capabilities:[]})
  else if(request.method==='ping')this.reply(request,{pong:true})
 }
 reply(request,result){queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({jsonrpc:'2.0',id:request.id,result,error:null})})))}
 close(){this.readyState=3;this.dispatchEvent(new Event('close'))}
}
globalThis.WebSocket=Socket
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
const transport=await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
const auth=await vite.ssrLoadModule('/src/lib/auth.ts')
after(async()=>{for(const socket of sockets)socket.close();await vite.close();Object.assign(globalThis,previous)})

test('changing account closes the previous socket, rejects its pending result, and authenticates the next connection',async()=>{
 await transport.rpcRequest('ping',{})
 const first=sockets[0]
 assert.equal(first.requests[0].params.coreToken,'account-a')
 const pending=transport.rpcRequest('session.list',{})
 const rejected=assert.rejects(pending)
 await new Promise(resolve=>setImmediate(resolve))
 auth.saveAuth({token:'account-b',user:{id:2,username:'b'}})
 await rejected
 assert.equal(first.readyState,3)
 await transport.rpcRequest('ping',{})
 assert.equal(sockets.at(-1).requests[0].params.coreToken,'account-b')
 auth.clearAuth({preserveRuntimeOrigin:true})
 assert.equal(sockets.at(-1).readyState,3)
})
