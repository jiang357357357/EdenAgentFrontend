import { RegionAttachment, VertexAttachment, type Spine, type Slot } from '@esotericsoftware/spine-pixi-v7'
import { calculateVertexBounds, type SpineBounds } from '../../components/character/renderer/spine/spine-layout'

export function actorSlot(slot: Slot): boolean {
  if (/desk|chair|pot/i.test(slot.data.name) && !/shadow/i.test(slot.data.name)) return false
  for (let bone = slot.bone; bone; bone = bone.parent!) {
    if (/^(?:Arona_|Back_Arona_|Plana_|NP0035_)/.test(bone.data.name)) return true
  }
  return false
}

export function roomActorBounds(model: Spine): SpineBounds | undefined {
  const points: number[] = []
  for (const slot of model.skeleton.slots.filter(actorSlot)) {
    const attachment = slot.getAttachment()
    if (!attachment || slot.color.a <= .01) continue
    if (attachment instanceof RegionAttachment) {
      const vertices = new Float32Array(8)
      attachment.computeWorldVertices(slot, vertices, 0, 2)
      points.push(...vertices)
    } else if (attachment instanceof VertexAttachment) {
      const vertices = new Float32Array(attachment.worldVerticesLength)
      attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2)
      points.push(...vertices)
    }
  }
  return calculateVertexBounds(points)
}

export function roomPlacement(width: number, height: number, actor?: SpineBounds) {
  // The supplied scene's authored camera is 2880 x 1620 around (0, 900).
  // Spine-Pixi uses downward-positive Y, unlike the source C++ renderer.
  const scale = Math.max(width / 2880, height / 1620)
  let x = width / 2
  if (width / height < 1.2 && actor) {
    x = width / 2 - (actor.x + actor.width / 2) * scale
    x = Math.min(1440 * scale, Math.max(width - 1440 * scale, x))
  }
  return { x, y: height / 2 + 900 * scale, scale }
}

export function visibleActor(bounds: SpineBounds, placement: ReturnType<typeof roomPlacement>, width: number, height: number) {
  const left = Math.max(0, bounds.x * placement.scale + placement.x - 12)
  const top = Math.max(0, bounds.y * placement.scale + placement.y - 12)
  const right = Math.min(width, (bounds.x + bounds.width) * placement.scale + placement.x + 12)
  const bottom = Math.min(height, (bounds.y + bounds.height) * placement.scale + placement.y + 12)
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}
