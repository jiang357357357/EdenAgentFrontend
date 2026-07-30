export interface SpineInteractionAnimations {
  lookMain?: string
  lookAux?: string
  lookEndMain?: string
  lookEndAux?: string
  patMain?: string
  patAux?: string
  patEndMain?: string
  patEndAux?: string
  reactions: string[]
  all: Set<string>
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
  const lookEndMain = resolveOne(animationNames, ["LookEnd_01_M", "LookEnd_M"], /^LookEnd(?:_\d+)?_M$/i)
  const lookEndAux = resolveOne(animationNames, ["LookEnd_01_A", "LookEnd_A"], /^LookEnd(?:_\d+)?_A$/i)
  const patMain = resolveOne(animationNames, ["Pat_01_M", "Pat_M", "Pat"], /^Pat(?:_\d+)?_M$/i)
  const patAux = resolveOne(animationNames, ["Pat_01_A", "Pat_A"], /^Pat(?:_\d+)?_A$/i)
  const patEndMain = resolveOne(animationNames, ["PatEnd_01_M", "PatEnd_M"], /^PatEnd(?:_\d+)?_M$/i)
  const patEndAux = resolveOne(animationNames, ["PatEnd_01_A", "PatEnd_A"], /^PatEnd(?:_\d+)?_A$/i)
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
    lookEndMain,
    lookEndAux,
    patMain,
    patAux,
    patEndMain,
    patEndAux,
    ...reactions,
  ].filter((name): name is string => Boolean(name)))

  return {
    lookMain,
    lookAux,
    lookEndMain,
    lookEndAux,
    patMain,
    patAux,
    patEndMain,
    patEndAux,
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

export function shouldLoopSpineAction(mapping: {
  loop?: boolean
  track?: number
  reset_to_idle?: boolean
}) {
  if (!mapping.loop) return false
  const track = Math.max(0, Math.min(15, mapping.track ?? 1))
  return track === 0 || mapping.reset_to_idle === false
}
