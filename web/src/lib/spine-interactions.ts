export interface SpineInteractionAnimations {
  lookMain?: string
  lookAux?: string
  lookHoldMain?: string
  lookHoldAux?: string
  lookEndMain?: string
  lookEndAux?: string
  patMain?: string
  patAux?: string
  patHoldMain?: string
  patHoldAux?: string
  patEndMain?: string
  patEndAux?: string
  pinchMain?: string
  pinchAux?: string
  pinchHoldMain?: string
  pinchHoldAux?: string
  pinchEndMain?: string
  pinchEndAux?: string
  blink?: string
  rareIdle?: string
  talks: SpineInteractionPair[]
  reactions: string[]
  all: Set<string>
}

export interface SpineInteractionPair {
  main: string
  aux?: string
}

export function resolveSpineBlinkPlayback(animationDurationSeconds: number) {
  const duration = Number.isFinite(animationDurationSeconds) ? Math.max(0, animationDurationSeconds) : 0
  const minimumDurationSeconds = 0.16
  return {
    timeScale: duration > 0 && duration < minimumDurationSeconds
      ? duration / minimumDurationSeconds
      : 1,
    mixOutSeconds: 0.08,
  }
}

function firstExact(animationNames: string[], candidates: string[]) {
  const byLowerName = new Map(animationNames.map((name) => [name.toLowerCase(), name]))
  for (const candidate of candidates) {
    const match = byLowerName.get(candidate.toLowerCase())
    if (match) return match
  }
  return undefined
}

function firstMatching(animationNames: string[], pattern: RegExp) {
  return animationNames.find((name) => pattern.test(name))
}

function resolveOne(animationNames: string[], candidates: string[], fallbackPattern: RegExp) {
  return firstExact(animationNames, candidates) ?? firstMatching(animationNames, fallbackPattern)
}

export function resolveSpineInteractionAnimations(animationNames: string[]): SpineInteractionAnimations {
  const lookMain = resolveOne(animationNames, ["Look_01_M", "Look_M", "Look"], /^Look(?:_\d+)?_M$/i)
  const lookAux = resolveOne(animationNames, ["Look_01_A", "Look_A"], /^Look(?:_\d+)?_A$/i)
  const lookHoldMain = firstExact(animationNames, ["Look_02_M"])
  const lookHoldAux = firstExact(animationNames, ["Look_02_A"])
  const lookEndMain = resolveOne(animationNames, ["LookEnd_01_M", "LookEnd_M"], /^LookEnd(?:_\d+)?_M$/i)
  const lookEndAux = resolveOne(animationNames, ["LookEnd_01_A", "LookEnd_A"], /^LookEnd(?:_\d+)?_A$/i)
  const patMain = resolveOne(animationNames, ["Pat_01_M", "Pat_M", "Pat"], /^Pat(?:_\d+)?_M$/i)
  const patAux = resolveOne(animationNames, ["Pat_01_A", "Pat_A"], /^Pat(?:_\d+)?_A$/i)
  const patHoldMain = firstExact(animationNames, ["Pat_02_M"])
  const patHoldAux = firstExact(animationNames, ["Pat_02_A"])
  const patEndMain = resolveOne(animationNames, ["PatEnd_01_M", "PatEnd_M"], /^PatEnd(?:_\d+)?_M$/i)
  const patEndAux = resolveOne(animationNames, ["PatEnd_01_A", "PatEnd_A"], /^PatEnd(?:_\d+)?_A$/i)
  const pinchMain = resolveOne(animationNames, ["Pinch_01_M", "Pinch_M", "Pinch"], /^Pinch(?:_\d+)?_M$/i)
  const pinchAux = resolveOne(animationNames, ["Pinch_01_A", "Pinch_A"], /^Pinch(?:_\d+)?_A$/i)
  const pinchHoldMain = firstExact(animationNames, ["Pinch_02_M"])
  const pinchHoldAux = firstExact(animationNames, ["Pinch_02_A"])
  const pinchEndMain = resolveOne(animationNames, ["PinchEnd_01_M", "PinchEnd_M"], /^PinchEnd(?:_\d+)?_M$/i)
  const pinchEndAux = resolveOne(animationNames, ["PinchEnd_01_A", "PinchEnd_A"], /^PinchEnd(?:_\d+)?_A$/i)
  const blink = resolveOne(
    animationNames,
    ["Eye_Close_01", "Eye_Close", "EyeClose", "Blink_01", "Blink"],
    /^(?:Eye_?Close|Blink)(?:_\d+)?$/i,
  )
  const rareIdle = firstExact(animationNames, ["Idle_01_R"])
  const talks = animationNames
    .filter((name) => /^Talk_\d+_M$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((main) => ({
      main,
      aux: firstExact(animationNames, [`${main.slice(0, -2)}_A`]),
    }))
  const preferredReactions = ["03", "12", "31", "32", "22", "13"]
  const reactions = preferredReactions.filter((name) => animationNames.includes(name))
  if (!reactions.length) {
    reactions.push(
      ...animationNames.filter((name) => /^(?:Tap|Touch|React|Happy)(?:_|$)/i.test(name)).slice(0, 6),
    )
  }
  const all = new Set([
    lookMain,
    lookAux,
    lookHoldMain,
    lookHoldAux,
    lookEndMain,
    lookEndAux,
    patMain,
    patAux,
    patHoldMain,
    patHoldAux,
    patEndMain,
    patEndAux,
    pinchMain,
    pinchAux,
    pinchHoldMain,
    pinchHoldAux,
    pinchEndMain,
    pinchEndAux,
    ...talks.flatMap((talk) => [talk.main, talk.aux]),
    ...reactions,
  ].filter((name): name is string => Boolean(name)))

  return {
    lookMain,
    lookAux,
    lookHoldMain,
    lookHoldAux,
    lookEndMain,
    lookEndAux,
    patMain,
    patAux,
    patHoldMain,
    patHoldAux,
    patEndMain,
    patEndAux,
    pinchMain,
    pinchAux,
    pinchHoldMain,
    pinchHoldAux,
    pinchEndMain,
    pinchEndAux,
    blink,
    rareIdle,
    talks,
    reactions,
    all,
  }
}

export function spineInteractionZone(normalizedModelY: number): "head" | "body" {
  return normalizedModelY <= 0.4 ? "head" : "body"
}

export function pickSpineReaction(reactions: string[], previous?: string, random = Math.random) {
  if (!reactions.length) return undefined
  if (reactions.length === 1) return reactions[0]
  const candidates = reactions.filter((name) => name !== previous)
  const index = Math.min(candidates.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * candidates.length))
  return candidates[index]
}

export function pickSpineInteractionPair(
  pairs: SpineInteractionPair[],
  previous?: string,
  random = Math.random,
) {
  if (!pairs.length) return undefined
  if (pairs.length === 1) return pairs[0]
  const candidates = pairs.filter((pair) => pair.main !== previous)
  const index = Math.min(
    candidates.length - 1,
    Math.floor(Math.max(0, Math.min(0.999999, random())) * candidates.length),
  )
  return candidates[index]
}

export function randomSpineDelayMs(minSeconds: number, maxSeconds: number, random = Math.random) {
  const min = Math.max(0, Math.min(minSeconds, maxSeconds))
  const max = Math.max(min, Math.max(minSeconds, maxSeconds))
  return (min + Math.max(0, Math.min(0.999999, random())) * (max - min)) * 1000
}

export function shouldLoopSpineAction(mapping: {
  loop?: boolean
  track?: number
  reset_to_idle?: boolean
}) {
  if (!mapping.loop) return false
  const track = Math.max(0, Math.min(15, mapping.track ?? 1))
  return track === 0 || mapping.reset_to_idle === false
}
