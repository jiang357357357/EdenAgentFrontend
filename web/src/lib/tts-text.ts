import type { PetTTSMode } from "./desktop-window"

export function stripMarkdownForSpeech(text: string) {
  return text
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/(\*\*|__|~~|`|\*|_)/g, "")
    .replace(/\\([\\`*_[\]{}()#+.!>|~-])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim()
}

export function textForTTS(text: string, mode: PetTTSMode) {
  if (mode === "none") return ""
  const content = mode === "all"
    ? text
    : text
        .replace(/（[^（）]*）/g, " ")
        .replace(/\([^()]*\)/g, " ")
  return stripMarkdownForSpeech(content)
}
