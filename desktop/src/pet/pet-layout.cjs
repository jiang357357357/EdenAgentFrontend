const MIN_PET_CHARACTER_HEIGHT = 120

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function petCoordinate(value) {
  if (value === null || value === undefined || value === "") return null
  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? Math.round(coordinate) : null
}

function petInteractionRatio(settings) {
  if (!settings.showInput) return 0
  return clamp((settings.inputHeight + 16) / 100, 0.28, 0.5)
}

function calculatePetWindowBounds(settings, workArea, minCharacterHeight = MIN_PET_CHARACTER_HEIGHT) {
  const storedX = petCoordinate(settings.windowX)
  const storedY = petCoordinate(settings.windowY)
  const scale = settings.petScale / 100
  const characterHeight = Math.round(clamp(workArea.height * 0.5 * scale, minCharacterHeight, workArea.height))
  const inputRatio = petInteractionRatio(settings)
  const layoutGapRatio = settings.showInput ? 0.04 : 0
  const height = Math.round(characterHeight / Math.max(0.12, 1 - inputRatio - layoutGapRatio))
  const width = Math.round(height * (7 / 16))
  const margin = 16
  const fallbackX = settings.dock === "left"
    ? workArea.x + margin
    : settings.dock === "right"
      ? workArea.x + workArea.width - width - margin
      : workArea.x + Math.round((workArea.width - width) / 2)
  const fallbackY = workArea.y + workArea.height - height - margin
  return {
    x: storedX ?? fallbackX,
    y: storedY ?? fallbackY,
    width,
    height,
  }
}

function calculatePetWindowLayout(settings, workArea, minCharacterHeight = MIN_PET_CHARACTER_HEIGHT) {
  const group = calculatePetWindowBounds(settings, workArea, minCharacterHeight)
  const inputRatio = petInteractionRatio(settings)
  const layoutGapRatio = settings.showInput ? 0.04 : 0
  const characterOffset = Math.round(group.height * (inputRatio + layoutGapRatio))
  const character = {
    x: group.x,
    y: group.y + characterOffset,
    width: group.width,
    height: Math.max(1, group.height - characterOffset),
  }
  const expandedWidth = Math.max(1, Math.round(group.width * (settings.inputWidth / 100)))
  const expandedHeight = Math.max(1, Math.round(group.height * inputRatio))
  const expandedBubble = {
    x: group.x + Math.round((group.width - expandedWidth) / 2),
    y: group.y,
    width: expandedWidth,
    height: expandedHeight,
  }
  const buttonSize = Math.max(32, Math.round(group.height * 0.06))
  const collapsedBubble = {
    x: group.x,
    y: character.y - buttonSize - Math.round(group.height * 0.02),
    width: buttonSize,
    height: buttonSize,
  }
  return { group, character, expandedBubble, collapsedBubble, characterOffset }
}

module.exports = {
  calculatePetWindowBounds,
  calculatePetWindowLayout,
  petCoordinate,
  petInteractionRatio,
}
