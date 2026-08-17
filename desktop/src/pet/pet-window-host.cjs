function finiteCoordinate(value) {
  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? Math.round(coordinate) : 0
}

function normalizeBounds(bounds) {
  return {
    x: finiteCoordinate(bounds?.x),
    y: finiteCoordinate(bounds?.y),
    width: Math.max(1, finiteCoordinate(bounds?.width)),
    height: Math.max(1, finiteCoordinate(bounds?.height)),
  }
}

function usesPetWorkAreaHost(platform = process.platform) {
  return platform === "linux"
}

function visibleViewportShape(viewport, hostBounds) {
  const left = Math.max(0, viewport.x)
  const top = Math.max(0, viewport.y)
  const right = Math.min(hostBounds.width, viewport.x + viewport.width)
  const bottom = Math.min(hostBounds.height, viewport.y + viewport.height)
  if (right <= left || bottom <= top) return []
  return [{
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }]
}

function calculatePetWindowHostLayout(characterBounds, workArea, platform = process.platform) {
  const character = normalizeBounds(characterBounds)
  if (!usesPetWorkAreaHost(platform)) {
    return {
      hostBounds: character,
      characterViewport: {
        mode: "window",
        x: 0,
        y: 0,
        width: character.width,
        height: character.height,
      },
      shape: [],
    }
  }

  const hostBounds = normalizeBounds(workArea)
  const characterViewport = {
    mode: "work-area",
    x: character.x - hostBounds.x,
    y: character.y - hostBounds.y,
    width: character.width,
    height: character.height,
  }
  return {
    hostBounds,
    characterViewport,
    shape: visibleViewportShape(characterViewport, hostBounds),
  }
}

function sameBounds(left, right, tolerance = 1) {
  if (!left || !right) return false
  return ["x", "y", "width", "height"].every(
    (key) => Math.abs(finiteCoordinate(left[key]) - finiteCoordinate(right[key])) <= tolerance,
  )
}

function sameCharacterViewport(left, right) {
  return Boolean(left && right && left.mode === right.mode && sameBounds(left, right, 0))
}

module.exports = {
  calculatePetWindowHostLayout,
  sameBounds,
  sameCharacterViewport,
  usesPetWorkAreaHost,
  visibleViewportShape,
}
