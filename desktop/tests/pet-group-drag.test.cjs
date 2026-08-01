const test = require("node:test")
const assert = require("node:assert/strict")
const { createPetGroupDrag, petGroupPositionAtPointer } = require("../src/pet-group-drag.cjs")

test("moves the whole pet group by the pointer delta", () => {
  const drag = createPetGroupDrag({ ownerId: 7, pointerX: 100, pointerY: 200, groupX: 40, groupY: 60 })
  assert.deepEqual(petGroupPositionAtPointer(drag, 135, 182), { x: 75, y: 42 })
})

test("does not clamp intentional off-screen positions", () => {
  const drag = createPetGroupDrag({ ownerId: 7, pointerX: 100, pointerY: 100, groupX: 10, groupY: 10 })
  assert.deepEqual(petGroupPositionAtPointer(drag, 20, 15), { x: -70, y: -75 })
})

test("rejects invalid pointer coordinates", () => {
  assert.equal(createPetGroupDrag({ ownerId: 7, pointerX: NaN, pointerY: 1, groupX: 2, groupY: 3 }), null)
})
