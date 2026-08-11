const MIN_PET_CHARACTER_HEIGHT = 120
const MIN_PET_VISIBLE_SIZE = 64
const PET_BUBBLE_MARGIN = 8
const PET_ICON_PADDING = 4
const PET_ICON_EDGE_RELEASE_DISTANCE = 16

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

function petPositionRange(workStart, workSize, petSize, minVisible = MIN_PET_VISIBLE_SIZE) {
  const visibleSize = Math.min(
    Math.max(1, Math.round(minVisible)),
    Math.max(1, Math.round(workSize)),
    Math.max(1, Math.round(petSize)),
  )
  return {
    min: workStart - petSize + visibleSize,
    max: workStart + workSize - visibleSize,
  }
}

function clampRectToWorkArea(rect, workArea, margin = PET_BUBBLE_MARGIN) {
  const marginX = Math.min(Math.max(0, margin), Math.max(0, Math.floor((workArea.width - 1) / 2)))
  const marginY = Math.min(Math.max(0, margin), Math.max(0, Math.floor((workArea.height - 1) / 2)))
  const left = workArea.x + marginX
  const top = workArea.y + marginY
  const availableWidth = Math.max(1, workArea.width - marginX * 2)
  const availableHeight = Math.max(1, workArea.height - marginY * 2)
  const width = Math.min(Math.max(1, Math.round(rect.width)), availableWidth)
  const height = Math.min(Math.max(1, Math.round(rect.height)), availableHeight)
  return {
    x: Math.round(clamp(rect.x, left, left + availableWidth - width)),
    y: Math.round(clamp(rect.y, top, top + availableHeight - height)),
    width,
    height,
  }
}

function snapPetIconToWorkArea(rect, workArea, previousEdge = "none") {
  const left = workArea.x
  const top = workArea.y
  const right = workArea.x + workArea.width
  const bottom = workArea.y + workArea.height
  const size = Math.min(Math.max(1, Math.round(rect.size)), workArea.width, workArea.height)
  const distances = {
    left: rect.x - left,
    right: right - (rect.x + size),
    top: rect.y - top,
    bottom: bottom - (rect.y + size),
  }
  const collisions = Object.entries(distances)
    .filter(([, distance]) => distance <= 0)
    .sort((leftEntry, rightEntry) => leftEntry[1] - rightEntry[1])
  const retainedEdge = previousEdge !== "none" && distances[previousEdge] <= PET_ICON_EDGE_RELEASE_DISTANCE
    ? previousEdge
    : undefined
  const edge = retainedEdge ?? collisions[0]?.[0] ?? "none"
  const x = clamp(rect.x, left, right - size)
  const y = clamp(rect.y, top, bottom - size)
  return { x: Math.round(x), y: Math.round(y), size, edge }
}

function resolvePetIconLayout(character, buttonSize, gap, workArea, previousPlacement = {}) {
  const snapped = snapPetIconToWorkArea(
    {
      x: character.x,
      y: character.y - buttonSize - gap,
      size: buttonSize,
    },
    workArea,
    previousPlacement.edge,
  )
  return {
    visualBounds: { x: snapped.x, y: snapped.y, width: snapped.size, height: snapped.size },
    placement: { anchor: "top-left", edge: snapped.edge },
  }
}

function calculatePetWindowBounds(settings, workArea, minCharacterHeight = MIN_PET_CHARACTER_HEIGHT) {
  const storedX = petCoordinate(settings.windowX)
  const storedY = petCoordinate(settings.windowY)
  const scale = settings.petScale / 100
  const characterHeight = Math.round(clamp(workArea.height * 0.5 * scale, minCharacterHeight, workArea.height))
  const inputRatio = petInteractionRatio(settings)
  const layoutGapRatio = settings.showInput ? 0.04 : 0
  // The character itself tops out at the work-area height at 200%. The complete
  // group may be taller because its independently positioned bubble also needs
  // space; capping the group made every scale above roughly 120% identical.
  const height = Math.round(characterHeight / Math.max(0.12, 1 - inputRatio - layoutGapRatio))
  const width = Math.round(height * (7 / 16))
  const margin = 16
  const fallbackX = settings.dock === "left"
    ? workArea.x + margin
    : settings.dock === "right"
      ? workArea.x + workArea.width - width - margin
      : workArea.x + Math.round((workArea.width - width) / 2)
  const fallbackY = workArea.y + workArea.height - height - margin
  const requestedX = storedX ?? fallbackX
  const requestedY = storedY ?? fallbackY
  const xRange = petPositionRange(workArea.x, workArea.width, width)
  const yRange = petPositionRange(workArea.y, workArea.height, height)
  return {
    x: clamp(requestedX, xRange.min, xRange.max),
    y: clamp(requestedY, yRange.min, yRange.max),
    width,
    height,
  }
}

function calculatePetWindowLayout(
  settings,
  workArea,
  minCharacterHeight = MIN_PET_CHARACTER_HEIGHT,
  options = {},
) {
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
  const expandedBubble = clampRectToWorkArea({
    x: group.x + Math.round((group.width - expandedWidth) / 2),
    y: group.y,
    width: expandedWidth,
    height: expandedHeight,
  }, workArea)
  const buttonSize = Math.max(32, Math.round(group.height * 0.06))
  const iconLayout = resolvePetIconLayout(
    character,
    buttonSize,
    Math.round(group.height * 0.02),
    workArea,
    options.previousIconPlacement,
  )
  const collapsedBubble = {
    x: iconLayout.visualBounds.x - PET_ICON_PADDING,
    y: iconLayout.visualBounds.y - PET_ICON_PADDING,
    width: buttonSize + PET_ICON_PADDING * 2,
    height: buttonSize + PET_ICON_PADDING * 2,
  }
  return {
    group,
    character,
    expandedBubble,
    collapsedBubble,
    iconPlacement: iconLayout.placement,
    characterOffset,
  }
}

module.exports = {
  calculatePetWindowBounds,
  calculatePetWindowLayout,
  clampRectToWorkArea,
  petCoordinate,
  petInteractionRatio,
  petPositionRange,
  resolvePetIconLayout,
  snapPetIconToWorkArea,
}
