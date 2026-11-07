import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkbenchCommands } from '../src/components/workbench/workbench-commands.ts'
import { initialWorkbench } from '../src/components/workbench/workbench-state.ts'

test('application commands navigate once instead of creating, moving or splitting a document',()=>{
  const dispatched=[],pages=[]
  const input={state:initialWorkbench(),dispatch:action=>dispatched.push(action),store:{archived:()=>[]},onSelect:()=>{},onClose:()=>{},onNewChat:()=>{},sessionId:'session'}
  const commands=buildWorkbenchCommands({...input,onOpenPage:page=>pages.push(page)})
  commands.find(command=>command.id==='page:selfAwake').run()
  commands.find(command=>command.id==='page:settings').run()
  assert.deepEqual(pages,['selfAwake','settings'])
  assert.deepEqual(dispatched,[])
  assert.equal(buildWorkbenchCommands(input).some(command=>command.id==='page:selfAwake'),false)
})
