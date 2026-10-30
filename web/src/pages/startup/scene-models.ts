import { Container, type Renderer, type RenderTexture } from 'pixi.js'
import { loadSpineAsset, type LoadedSpineAsset } from '../../lib/spine-loader'
import { actorSlot, roomActorBounds, roomPlacement, visibleActor } from './room-geometry'
import { foregroundLayout } from './foreground-layout'
import type { StartupScene } from './startup-assets'
import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'
import type { SceneCommand } from './scene-transition'

export class SceneModels {
  readonly roomLayer = new Container()
  readonly foregroundLayer = new Container()
  private actorAlpha: number[] = []
  private roomBounds?: SpineBounds
  private readonly characterBounds: SpineBounds
  foregroundBounds?: SpineBounds
  reactionDuration = 0
  private pose = ''
  private constructor(readonly room: LoadedSpineAsset, readonly character: LoadedSpineAsset, scene: StartupScene) {
    this.roomLayer.addChild(room.spine); this.foregroundLayer.addChild(character.spine)
    if (!character.animations.includes('Idle_01')) throw new Error('角色缺少待机动画')
    this.characterBounds = character.spine.boundsProvider!.calculateBounds(character.spine)
    if (!(this.characterBounds.width > 0 && this.characterBounds.height > 0)) throw new Error('角色边界为空')
    this.selectPose(scene.room.idle_animation!); this.resetCharacter()
  }
  selectPose(pose: string) {
    const required = ['Idle_background_00', pose, pose + '_Touch_A', pose + '_Touch_M']
    for (const name of required) if (!this.room.animations.includes(name)) throw new Error(`场景缺少动画 ${name}`)
    this.pose = pose
    this.reactionDuration = Math.max(.3, ...required.slice(2).map(name => this.room.spine.skeleton.data.findAnimation(name)!.duration))
    this.resetRoom()
  }
  static async load(scene: StartupScene, signal: AbortSignal) {
    const results = await Promise.allSettled([loadSpineAsset(scene.room, signal), loadSpineAsset(scene.character, signal)])
    try {
      if (signal.aborted) throw new DOMException('Scene load aborted', 'AbortError')
      const [room, character] = results.map(result => { if (result.status === 'rejected') throw result.reason; return result.value })
      return new SceneModels(room, character, scene)
    } catch (error) {
      for (const result of results) if (result.status === 'fulfilled') result.value.dispose()
      throw error
    }
  }
  private restoreAlpha() {
    this.room.spine.skeleton.slots.forEach((slot, index) => { if (this.actorAlpha[index] !== undefined) slot.color.a = this.actorAlpha[index] })
    this.actorAlpha = []
  }
  private resetRoom() {
    this.restoreAlpha()
    const model = this.room.spine
    model.state.clearTracks(); model.skeleton.setToSetupPose()
    model.state.setAnimation(0, 'Idle_background_00', true)
    model.state.setAnimation(1, this.pose, true)
    model.update(0); this.roomBounds = roomActorBounds(model)
  }
  private resetCharacter() {
    const model = this.character.spine
    model.state.clearTracks(); model.skeleton.setToSetupPose(); model.state.setAnimation(0, 'Idle_01', true); model.update(0)
  }
  command(value: SceneCommand) {
    this.resetRoom()
    if (value !== 'room') this.resetCharacter()
    if (value === 'wake') for (const track of [2, 3]) {
      this.room.spine.state.setAnimation(track, this.pose + (track === 2 ? '_Touch_A' : '_Touch_M'), false)
    }
  }
  update(seconds: number, waking: boolean) {
    this.restoreAlpha()
    if (waking) for (const index of [2, 3]) {
      const entry = this.room.spine.state.getCurrent(index)
      if (entry) { entry.timeScale = 0; entry.trackTime = Math.min(entry.trackTime + seconds, Math.max(0, entry.animation!.duration - 1 / 30)) }
    }
    this.room.spine.update(seconds); this.character.spine.update(seconds)
  }
  actorOpacity(alpha: number) {
    this.room.spine.skeleton.slots.forEach((slot, index) => { this.actorAlpha[index] = slot.color.a; if (actorSlot(slot)) slot.color.a *= alpha })
  }
  captureActor(renderer: Renderer, target: RenderTexture) {
    const model = this.room.spine, saved = model.skeleton.slots.map(slot => slot.color.a), filters = model.filters
    try {
      model.filters = null
      model.skeleton.slots.forEach(slot => { if (!actorSlot(slot)) slot.color.a = 0 })
      renderer.render(this.roomLayer, { renderTexture: target, clear: true })
    } finally { model.filters = filters; model.skeleton.slots.forEach((slot, index) => { slot.color.a = saved[index] }) }
  }
  fit(width: number, height: number, protectedAreas: SpineBounds[]) {
    const place = roomPlacement(width, height, this.roomBounds)
    this.room.spine.scale.set(place.scale); this.room.spine.position.set(place.x, place.y)
    const bounds = this.characterBounds
    this.foregroundBounds = foregroundLayout(width, height, protectedAreas, bounds.width / bounds.height)
    const rect = this.foregroundBounds
    this.foregroundLayer.visible = !!rect
    if (rect) {
      const scale = rect.height / bounds.height
      this.character.spine.scale.set(scale); this.character.spine.position.set(rect.x - bounds.x * scale, rect.y - bounds.y * scale)
    }
    return this.roomBounds ? visibleActor(this.roomBounds, place, width, height) : undefined
  }
  dispose() { this.room.dispose(); this.character.dispose(); this.roomLayer.destroy(); this.foregroundLayer.destroy() }
}
