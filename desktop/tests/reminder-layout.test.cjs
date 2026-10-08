const assert = require('node:assert/strict')
const {test} = require('node:test')
const {EventEmitter} = require('node:events')
const {reminderLayout} = require('../src/reminders/reminder-layout.cjs')
const {createReminderWindow} = require('../src/reminders/reminder-window.cjs')

test('reminders stay within small and negative-origin work areas at both content limits', () => {
  for (const workArea of [{x:0,y:0,width:1440,height:800}, {x:-800,y:-300,width:320,height:250}]) {
    const layout=reminderLayout(workArea,'mon',{width:16,height:39})
    for(const height of [1,100000]){
      const bounds=layout.bounds(height)
      assert.ok(bounds.x>=workArea.x&&bounds.y>=workArea.y)
      assert.ok(bounds.x+bounds.width<=workArea.x+workArea.width)
      assert.ok(bounds.y+bounds.height<=workArea.y+workArea.height)
    }
  }
})

test('Mon and local reminders occupy separate horizontal slots on a desktop', () => {
  const workArea={x:0,y:0,width:1440,height:800}
  const mon=reminderLayout(workArea,'mon',{width:16,height:39}).bounds(220)
  const local=reminderLayout(workArea,'local',{width:16,height:39}).bounds(440)
  assert.ok(local.x+local.width<mon.x)
})

test('only the reminder sender may resize, with finite dimensions and complete listener cleanup', () => {
  class Window extends EventEmitter {
    constructor(){super();this.bounds={x:0,y:0,width:416,height:219};this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{}}
    getBounds(){return this.bounds}
    getContentBounds(){return {...this.bounds,width:this.bounds.width-16,height:this.bounds.height-39}}
    setBounds(bounds){this.bounds=bounds}
    isDestroyed(){return false}
    loadFile(){return Promise.resolve()}
  }
  const ipcMain=new EventEmitter()
  const window=createReminderWindow({BrowserWindow:Window,screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1440,height:800}})},ipcMain,
    origin:'mon',reminder:{title:'Fixture',message:'Fixture'},acknowledge:async()=>{},displayed:async()=>{},onClosed:()=>{}})
  const original=window.getBounds()
  for (const height of [NaN,Infinity,-1,'220']) ipcMain.emit('eden-reminder:resize',{sender:window.webContents},height)
  ipcMain.emit('eden-reminder:resize',{sender:{}},220)
  assert.deepEqual(window.getBounds(),original)
  ipcMain.emit('eden-reminder:resize',{sender:window.webContents},100000)
  assert.equal(window.getContentBounds().height,440)
  window.emit('closed')
  assert.equal(ipcMain.listenerCount('eden-reminder:resize'),0)
  assert.equal(ipcMain.listenerCount('eden-reminder:close'),0)
})
