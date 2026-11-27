import { useCallback, useState } from 'react'
import { resolveCoreAssetUrl, type CoreAssistant } from '../../../lib/auth'
import { resolveAssistantAppearance } from '../../character/assistant-appearance'
import { CharacterVisualRenderer } from '../../character/renderer/CharacterVisualRenderer'

export function VoiceCallPortrait({ assistant, name }: { assistant?: CoreAssistant | null | undefined; name: string }) {
  const character = assistant?.character
  const avatar = resolveCoreAssetUrl(character?.avatar_url)
  const portrait = resolveCoreAssetUrl(character?.default_standing_image_url)
  const appearance = resolveAssistantAppearance(assistant, { layout: 'standee' })
  const spine = appearance.layout === 'standee' && character?.visual_preference === 'spine' ? appearance.asset : undefined
  const [loadedStatic, setLoadedStatic] = useState<string>()
  const [loadedSpine, setLoadedSpine] = useState<string>()
  const spineKey = spine?.skeleton_url
  const markSpineReady = useCallback(() => setLoadedSpine(spineKey), [spineKey])
  const staticReady = Boolean(portrait && loadedStatic === portrait)
  const spineReady = Boolean(spineKey && loadedSpine === spineKey)

  return <div className="voice-call-art" data-standee={spineReady || staticReady ? 'ready' : undefined}>
    <span>{Array.from(name.trim())[0] || '助'}</span>
    {avatar && <img key={avatar} src={avatar} alt="" onError={event => { event.currentTarget.hidden = true }} />}
    {portrait && portrait !== avatar && <img key={portrait} className="voice-call-standee" src={portrait} alt=""
      hidden={spineReady} onLoad={() => setLoadedStatic(portrait)} onError={event => { event.currentTarget.hidden = true }} />}
    {spine && character && <div className="voice-call-spine" data-ready={spineReady}>
      <CharacterVisualRenderer key={spineKey} character={character} displayName={name} preferredSpineLayout="standee"
        preferredCostumeId={appearance.costumeKey ?? null} strictSpineSelection renderQuality="preview" onReady={markSpineReady} />
    </div>}
  </div>
}
