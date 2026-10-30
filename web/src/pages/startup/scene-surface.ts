import { Container, RenderTexture, type Renderer } from 'pixi.js'
import { SceneEffects } from './scene-effects'
import { SceneTransition, type SceneCommand } from './scene-transition'
import type { SceneModels } from './scene-models'
import type { StartupScene } from './startup-assets'
import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'

export interface SceneViewport { width: number; height: number; resolution: number }
export class SceneSurface {
  readonly stage = new Container()
  private readonly effects: SceneEffects
  private warmTarget?: RenderTexture = RenderTexture.create({ width: 1, height: 1 })
  private viewport?: SceneViewport
  transition: SceneTransition
  warmFrames = 0
  constructor(readonly scene: StartupScene, readonly models: SceneModels, pose: string) {
    models.selectPose(pose)
    this.transition = new SceneTransition(models.reactionDuration)
    this.effects = new SceneEffects(this.stage, models, scene.night)
  }
  selectPose(pose: string) {
    if (this.models.room.spine.state.getCurrent(1)?.animation?.name === pose) return
    this.models.selectPose(pose); this.transition = new SceneTransition(this.models.reactionDuration); this.effects.reset()
  }
  command(value: SceneCommand) { this.models.command(value); this.effects.reset(); this.transition.command(value) }
  fit(viewport: SceneViewport, areas: SpineBounds[]) {
    const { width, height, resolution } = viewport, previous = this.viewport
    if (!previous || previous.width !== width || previous.height !== height || previous.resolution !== resolution) {
      this.effects.resize(width, height, resolution)
      this.warmTarget?.setResolution(resolution); this.warmTarget?.resize(width, height)
      this.viewport = viewport
    }
    return this.models.fit(width, height, areas)
  }
  update(renderer: Renderer, seconds: number, waking: boolean) {
    this.models.update(Math.min(.1, seconds), waking)
    const frame = this.transition.update(seconds)
    this.effects.render(renderer, frame)
    return frame
  }
  warm(renderer: Renderer, seconds: number) {
    // Compile and render the entire candidate at native resolution without
    // replacing the scene currently attached to the visible canvas.
    this.update(renderer, seconds, false); this.effects.warm(renderer)
    renderer.render(this.stage, { renderTexture: this.warmTarget, clear: true })
    return ++this.warmFrames >= 3
  }
  finishWarm() { this.warmTarget?.destroy(true); this.warmTarget = undefined }
  dispose() { this.finishWarm(); this.effects.dispose(); this.stage.destroy({ children: false }) }
}
