import test from 'node:test'
import assert from 'node:assert/strict'
import { readCharacterPlacement, writeCharacterPlacement } from '../src/components/character/character-placement-storage.ts'
const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
test('latest adjustment is readable immediately on reopening without waiting for a timer', () => {
  const disk = storage(), key = 'eden-character-placement:mon:21'
  writeCharacterPlacement(disk, key, {x:.2,y:-.1,scale:.65})
  writeCharacterPlacement(disk, key, {x:.3,y:-.2,scale:.7})
  assert.deepEqual(readCharacterPlacement(disk,key), {x:.3,y:-.2,scale:.7})
  assert.deepEqual(readCharacterPlacement(disk,'eden-character-placement:local:21'), {x:0,y:0,scale:1})
  assert.deepEqual(readCharacterPlacement(disk,key), {x:.3,y:-.2,scale:.7})
})
test('storage failures are surfaced rather than reporting saved placement', () => {
  assert.throws(() => writeCharacterPlacement({getItem:()=>null,setItem:()=>{}}, 'key',{x:0,y:0,scale:1}), /could not be saved/)
  assert.throws(() => writeCharacterPlacement({getItem:()=>null,setItem:()=>{throw new Error('quota')}}, 'key',{x:0,y:0,scale:1}), /quota/)
})
test('existing keys restore and reset replaces the stored placement', () => {
  const disk=storage(), key='eden-character-placement:mon:21'
  disk.setItem(key,JSON.stringify({x:.4,y:.1,scale:.62}))
  assert.equal(readCharacterPlacement(disk,key).scale,.62)
  writeCharacterPlacement(disk,key,{x:0,y:0,scale:1})
  assert.deepEqual(readCharacterPlacement(disk,key),{x:0,y:0,scale:1})
})
