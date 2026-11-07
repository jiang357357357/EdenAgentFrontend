import assert from 'node:assert/strict'
import test from 'node:test'
import {build} from 'esbuild'
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {readFile,writeFile,mkdtemp,mkdir,rm,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {extensionFrameEsbuild} from './fixtures/extension-frame-esbuild.mjs'

test('actual Spine remains painted and attached while resizing workbench dividers',{timeout:120000,skip:process.platform!=='win32'},async()=>{
  const web=fileURLToPath(new URL('../',import.meta.url)),scratch=await mkdtemp(path.join(tmpdir(),'eden-spine-resize-')),logs=scratch
  const baseline=process.env.EDEN_RESIZE_BASELINE==='1',requests=[]
  const server=createServer(async(request,response)=>{
    const name=request.url?.slice(1)
    if(!['arona_spr.skel','arona_spr.atlas','arona_spr.png'].includes(name)){response.writeHead(404).end();return}
    requests.push(name);response.setHeader('Access-Control-Allow-Origin','*');response.end(await readFile(path.join(web,'dist/startup-scene',name)))
  })
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await mkdir(logs,{recursive:true})
    await build({absWorkingDir:web,entryPoints:['tests/fixtures/workbench-spine-resize.tsx'],outfile:path.join(scratch,'renderer.js'),bundle:true,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'resize-boundaries',setup(builder){
      builder.onResolve({filter:/plugin-ui\/PluginUiProvider$/},()=>({path:'plugin-ui-test',namespace:'fixture'}))
      builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const usePluginUi=()=>({views:[],errors:[],extensions:[],origin:"local"});export const PluginUiSession=({children})=>children;',loader:'js'}))
      builder.onLoad({filter:/SpineCharacterCanvas\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('appRef.current = app','appRef.current = app; window.__spineApp = app; window.__spineInstances++'),loader:'tsx'}))
    }},extensionFrameEsbuild()]})
    const index=await readFile(path.join(web,'dist/index.html'),'utf8'),css=/href="(?:\.?\/)?(assets\/[^"<>]+\.css)"/.exec(index)[1]
    await writeFile(path.join(scratch,'index.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(web,'dist',css)).href}"><body class="bg-bg text-text"><div id="root"></div><script>window.__assetBase='http://127.0.0.1:${server.address().port}';window.__fixtureErrors=[];window.addEventListener('error',e=>window.__fixtureErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__fixtureErrors.push(String(e.reason)));</script><script src="renderer.js"></script>`)
    const screenshot=path.join(logs,'workbench-spine-resize-'+(baseline?'before':'after')+'.png')
    await writeFile(path.join(scratch,'main.cjs'),`
const {app,BrowserWindow}=require('electron');const {writeFile}=require('node:fs/promises');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('enable-unsafe-swiftshader');app.setPath('userData',${JSON.stringify(path.join(scratch,'profile'))});
app.whenReady().then(async()=>{const window=new BrowserWindow({show:false,width:1552,height:840,webPreferences:{backgroundThrottling:false,offscreen:true}});const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{await window.loadFile(${JSON.stringify(path.join(scratch,'index.html'))});
for(let n=0;n<400&&!await window.webContents.executeJavaScript('window.__ready');n++)await delay(50);
if(!await window.webContents.executeJavaScript('window.__ready'))throw Error('Spine did not become ready: '+await window.webContents.executeJavaScript('JSON.stringify({errors:window.__fixtureErrors,body:document.body.innerText.slice(0,500)})'));
await window.webContents.executeJavaScript('startResizeProbe()');
const drag=async(name,deltas)=>{await window.webContents.executeJavaScript('dragDivider('+JSON.stringify(name)+','+JSON.stringify(deltas)+')');await delay(100)};
await drag('工具侧栏宽度',Array.from({length:50},(_,i)=>-Math.round(300*Math.sin(Math.PI*i/49))));
const wide=await window.webContents.executeJavaScript('JSON.parse(JSON.stringify(resizeProbe))');
window.setContentSize(1200,800);await delay(200);
await drag('主侧栏宽度',Array.from({length:50},(_,i)=>Math.round(145*(.5-.5*Math.cos(8*Math.PI*i/49)))));
const result=await window.webContents.executeJavaScript('({...JSON.parse(JSON.stringify(resizeProbe)),instances:__spineInstances})');result.wide=wide;
await writeFile(${JSON.stringify(screenshot)},(await window.webContents.capturePage()).toPNG());process.stdout.write('RESIZE_RESULT='+JSON.stringify(result)+'\\n');
}catch(error){process.stderr.write(String(error.stack||error));process.exitCode=1}finally{window.destroy();app.quit()}});`)
    const electron=createRequire(new URL('../../desktop/package.json',import.meta.url))('electron')
    const result=await new Promise((resolve,reject)=>{
      const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS
      const child=spawn(electron,[path.join(scratch,'main.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr=''
      const timer=setTimeout(()=>{child.kill();reject(Error('Spine resize acceptance timed out'))},100000)
      child.stdout.on('data',bytes=>stdout+=bytes);child.stderr.on('data',bytes=>stderr+=bytes)
      child.on('error',error=>{clearTimeout(timer);reject(error)})
      child.on('exit',code=>{clearTimeout(timer);const line=stdout.split(/\r?\n/).find(line=>line.startsWith('RESIZE_RESULT='));if(code||!line)reject(Error(stderr.slice(-5000)));else resolve(JSON.parse(line.slice(14)))})
    })
    await writeFile(path.join(logs,'workbench-spine-resize-'+(baseline?'before':'after')+'.json'),JSON.stringify({...result,assetRequests:requests},null,2))
    assert.equal(result.instances,1,'Resizing must not recreate the Spine application')
    assert.ok(result.resizes>10,'Acceptance must exercise actual renderer resizes')
    if(baseline)assert.ok(result.blankResizes>0||result.visibilityChanges>0,'Baseline must reproduce a visible discontinuity')
    else{assert.equal(result.blankResizes,0,'Every resized buffer must be repainted before a frame can be presented');assert.equal(result.visibilityChanges,0,'Dragging must not hide the role');assert.equal(result.parentChanges,0,'Dragging must not move the role between groups')}
  }finally{
    await new Promise(resolve=>server.close(resolve))
    const resolved=await realpath(scratch)
    if(path.dirname(resolved).toLowerCase()!==path.resolve(tmpdir()).toLowerCase()||!path.basename(resolved).startsWith('eden-spine-resize-'))throw Error('Unexpected resize fixture path')
    await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100})
  }
})
