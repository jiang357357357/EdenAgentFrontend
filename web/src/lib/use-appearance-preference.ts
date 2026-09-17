import type { AccentTheme, BaseTheme } from "@eden/api"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { rpcRequestForOrigin } from "./rpc-transport"
import { getRuntimeOriginRevision } from "./runtime-origin"

type Origin = "mon" | "local"
type PreferenceScope = { origin: Origin; revision: number; live: boolean; sequence: number; pending: Promise<void> }
export interface AppearancePreference {
  baseTheme: BaseTheme
  backgroundMode: "theme" | "wallpaper"
  accentTheme: AccentTheme
  chatFontScale: number
  componentFontScale: number
}
export const defaultAppearance: AppearancePreference = { baseTheme: "night", backgroundMode: "wallpaper", accentTheme: "mist", chatFontScale: 100, componentFontScale: 100 }

export function useAppearancePreference(origin: Origin | null, active: boolean, accountIdentity?: string | number) {
  const [value, setValue] = useState(defaultAppearance)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const owner = useRef<PreferenceScope | null>(null)

  useEffect(() => {
    setValue(defaultAppearance); setReady(false); setError(undefined)
    if (!origin || !active) return
    const scope: PreferenceScope = {
      origin, revision: getRuntimeOriginRevision(), live: true, sequence: 0, pending: Promise.resolve(),
    }
    owner.current = scope
    void rpcRequestForOrigin(origin, "ui.appearance.get", {}, scope.revision).then(result => {
      if (scope.live) { setValue({ ...defaultAppearance, ...result }); setReady(true) }
    }).catch(reason => { if (scope.live) setError(`读取外观设置失败：${String(reason)}`) })
    return () => {
      scope.live = false
    }
  }, [origin, active, accountIdentity])

  useLayoutEffect(() => {
    document.documentElement.dataset.accentTheme = value.accentTheme
    document.documentElement.dataset.baseTheme = value.baseTheme
    document.documentElement.dataset.backgroundMode = value.backgroundMode
    return () => {
      delete document.documentElement.dataset.accentTheme
      delete document.documentElement.dataset.baseTheme
      delete document.documentElement.dataset.backgroundMode
    }
  }, [value.accentTheme, value.baseTheme, value.backgroundMode])

  const change = (next: AppearancePreference) => {
    const scope = owner.current
    if (!scope?.live) return
    setValue(next); setError(undefined)
    const sequence = ++scope.sequence
    scope.pending = scope.pending.then(async () => {
      if (!scope.live || sequence !== scope.sequence) return
      try {
        const result = await rpcRequestForOrigin(scope.origin, "ui.appearance.update", next, scope.revision)
        if (scope.live && sequence === scope.sequence) setValue({ ...defaultAppearance, ...result })
      } catch (reason) {
        if (scope.live && sequence === scope.sequence) setError(`保存外观设置失败：${String(reason)}`)
      }
    })
  }

  return { value, ready, error, change }
}
