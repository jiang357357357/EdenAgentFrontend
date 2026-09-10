import type { CharacterPlacement } from './character-placement-context'

export const defaultCharacterPlacement: CharacterPlacement = { x: 0, y: 0, scale: 1 }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export function readCharacterPlacement(storage: Pick<Storage, 'getItem'>, key: string): CharacterPlacement {
  const value = JSON.parse(storage.getItem(key) ?? 'null')
  if (!value || ![value.x, value.y, value.scale].every(Number.isFinite)) return defaultCharacterPlacement
  return { x: clamp(value.x, -1, 1), y: clamp(value.y, -1, 1), scale: clamp(value.scale, .25, 3) }
}
export function writeCharacterPlacement(storage: Pick<Storage, 'setItem' | 'getItem'>, key: string, placement: CharacterPlacement) {
  const encoded = JSON.stringify(placement)
  storage.setItem(key, encoded)
  if (storage.getItem(key) !== encoded) throw new Error('Character placement could not be saved')
}
