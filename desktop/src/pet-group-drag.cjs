function finiteCoordinate(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function createPetGroupDrag({ ownerId, pointerX, pointerY, groupX, groupY }) {
  const startPointerX = finiteCoordinate(pointerX)
  const startPointerY = finiteCoordinate(pointerY)
  const startGroupX = finiteCoordinate(groupX)
  const startGroupY = finiteCoordinate(groupY)
  if (startPointerX === null || startPointerY === null || startGroupX === null || startGroupY === null) return null
  return {
    ownerId,
    startPointerX,
    startPointerY,
    startGroupX,
    startGroupY,
  }
}

function petGroupPositionAtPointer(drag, pointerX, pointerY) {
  if (!drag) return null
  const currentPointerX = finiteCoordinate(pointerX)
  const currentPointerY = finiteCoordinate(pointerY)
  if (currentPointerX === null || currentPointerY === null) return null
  return {
    x: Math.round(drag.startGroupX + currentPointerX - drag.startPointerX),
    y: Math.round(drag.startGroupY + currentPointerY - drag.startPointerY),
  }
}

module.exports = { createPetGroupDrag, petGroupPositionAtPointer }
