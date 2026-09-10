import { createContext } from 'react'

export type CharacterPlacement = { x: number; y: number; scale: number }
// A fixed canvas renders the full scene before the panel clips its outer edges.
export const CharacterPlacementContext = createContext<CharacterPlacement | null>(null)
