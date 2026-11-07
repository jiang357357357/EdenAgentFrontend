export type CharacterConfigurationView = 'basic' | 'complete' | 'visual'
export interface CharacterConfigurationNavigation {
  view: CharacterConfigurationView
  revision: number
}
