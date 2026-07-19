function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function stripAssistantSpeakerPrefix(text: string, names: Array<string | null | undefined>) {
  const candidates = Array.from(
    new Set(names.map((name) => String(name || "").trim()).filter(Boolean)),
  ).sort((left, right) => right.length - left.length)
  if (!candidates.length || !text.trim()) return text
  const alternatives = candidates.map(escapeRegExp).join("|")
  const prefix = new RegExp(
    `^(\\s*)(?:(?:\\*\\*|__)(?:${alternatives})\\s*[：:](?:\\*\\*|__)|(?:${alternatives})\\s*[：:]|[【\\[](?:${alternatives})[】\\]]\\s*[：:])\\s*`,
    "u",
  )
  return text.replace(prefix, "$1")
}
