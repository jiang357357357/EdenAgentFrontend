import { Application, UPDATE_PRIORITY, type Renderer } from 'pixi.js'
import { SceneModelCache, sceneModelKey } from './scene-model-cache'
import { SceneSurface, type SceneViewport } from './scene-surface'
import type { SceneCommand, SceneFrame, StartupPhase } from './scene-transition'
import { sceneResolution } from './scene-resolution'
import type { StartupScene } from './startup-assets'
import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'

interface Callbacks { ready(): void; bounds(value: SpineBounds): void; foreground?(value: SpineBounds | undefined): void; phase(value: StartupPhase): void; error(error: unknown): void }
export class StartupSceneRenderer {
  private readonly app: Application
  private readonly observer: ResizeObserver
  private readonly cache = new SceneModelCache()
  private readonly textureLimit: number
  private controller?: AbortController
  private timeout?: number
  private resolutionMedia?: MediaQueryList
  private active?: SceneSurface
  private pending?: SceneSurface
  private requested?: { key: string; pose: string }
  private viewport?: SceneViewport
  private disposed = false
  private commandValue: SceneCommand = 'room'
  private lastPhase?: StartupPhase
  private protectedAreas: SpineBounds[] = []
  constructor(private readonly host: HTMLElement, scene: StartupScene, private readonly callbacks: Callbacks) {
    this.app = new Application({ resizeTo: host, antialias: true, autoDensity: true,
      resolution: sceneResolution(window.devicePixelRatio, host.clientWidth, host.clientHeight, Infinity), backgroundAlpha: 0 })
    const renderer = this.app.renderer as Renderer
    this.textureLimit = Math.min(renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE), renderer.gl.getParameter(renderer.gl.MAX_RENDERBUFFER_SIZE))
    this.app.ticker.maxFPS = 30
    const canvas = this.app.view as HTMLCanvasElement
    canvas.className = 'block h-full w-full'; canvas.setAttribute('aria-hidden', 'true'); host.appendChild(canvas)
    this.observer = new ResizeObserver(() => this.fit()); this.observer.observe(host)
    this.watchResolution()
    this.app.ticker.add(this.update, this, UPDATE_PRIORITY.NORMAL)
    document.addEventListener('visibilitychange', this.visibility); this.visibility()
    this.changeScene(scene)
  }
  changeScene(scene: StartupScene, pose = scene.room.idle_animation!) {
    const key = sceneModelKey(scene)
    if (this.requested?.key === key) { this.selectPose(pose); return }
    this.cancelPending(); this.requested = { key, pose }; this.host.dataset.sceneLoading = 'true'
    if (this.active && sceneModelKey(this.active.scene) === key) {
      this.active.selectPose(pose); this.fit(); this.complete(); return
    }
    const controller = new AbortController(); this.controller = controller
    this.timeout = window.setTimeout(() => { controller.abort(); this.fail(new Error('场景加载超时')) }, 12000)
    void this.cache.load(scene, controller.signal).then(models => {
      if (this.disposed || controller.signal.aborted || this.requested?.key !== key) return
      this.pending = new SceneSurface(scene, models, this.requested.pose)
      this.cache.retain(this.active && sceneModelKey(this.active.scene), key); this.fit()
    }).catch(error => { if (!this.disposed && !controller.signal.aborted) this.fail(error) })
  }
  private cancelPending() {
    window.clearTimeout(this.timeout); this.controller?.abort()
    this.pending?.dispose(); this.pending = undefined
  }
  selectPose(value: string) {
    if (!this.requested || this.commandValue !== 'room') return
    this.requested.pose = value
    try {
      if (this.pending) this.pending.selectPose(value)
      else if (this.active && sceneModelKey(this.active.scene) === this.requested.key) this.active.selectPose(value)
      this.fit()
      if (this.active) { this.app.render(); this.publish(this.active.transition.frame) }
    } catch (error) { this.fail(error) }
  }
  command(value: SceneCommand) {
    this.commandValue = value
    if (!this.active) return
    this.active.command(value); this.publish(this.active.transition.frame)
  }
  protect(areas: SpineBounds[]) { this.protectedAreas = areas; this.fit() }
  private fit() {
    if (this.disposed || !this.host.clientWidth || !this.host.clientHeight) return
    const width = this.host.clientWidth, height = this.host.clientHeight
    const resolution = sceneResolution(window.devicePixelRatio, width, height, this.textureLimit), previous = this.viewport
    this.viewport = { width, height, resolution }
    if (!previous || previous.width !== width || previous.height !== height || previous.resolution !== resolution) {
      this.app.renderer.resolution = resolution; this.app.renderer.resize(width, height)
    }
    const bounds = this.active?.fit(this.viewport, this.protectedAreas)
    this.pending?.fit(this.viewport, this.protectedAreas)
    if (bounds) this.callbacks.bounds(bounds)
    this.callbacks.foreground?.(this.active?.models.foregroundBounds)
    this.host.dataset.sceneResolution = JSON.stringify({ requested: window.devicePixelRatio, effective: resolution,
      width: (this.app.view as HTMLCanvasElement).width, height: (this.app.view as HTMLCanvasElement).height })
  }
  private complete() {
    window.clearTimeout(this.timeout); this.host.dataset.sceneLoading = 'false'
    this.host.dataset.scenePrewarmFrames = String(this.active!.warmFrames)
    this.host.dataset.sceneSource = this.active!.scene.night ? 'night' : 'day'
    this.active!.finishWarm(); this.active!.command(this.commandValue); this.fit()
    // Readiness follows the first real canvas draw, never the poster or an
    // offscreen warm-up frame.
    this.app.render(); this.publish(this.active!.transition.frame); this.callbacks.ready()
  }
  private commit() {
    const previous = this.active
    this.active = this.pending; this.pending = undefined
    this.app.stage.removeChildren(); this.app.stage.addChild(this.active!.stage)
    previous?.dispose(); this.lastPhase = undefined
    this.complete()
    this.cache.retain(sceneModelKey(this.active!.scene))
  }
  private watchResolution() {
    this.resolutionMedia?.removeEventListener('change', this.resolutionChanged)
    this.resolutionMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    this.resolutionMedia.addEventListener('change', this.resolutionChanged)
  }
  private resolutionChanged = () => { this.fit(); this.watchResolution() }
  private update() {
    if (this.disposed) return
    try {
      const renderer = this.app.renderer as Renderer, seconds = this.app.ticker.elapsedMS / 1000
      if (this.pending?.warm(renderer, seconds)) this.commit()
      if (this.active) this.publish(this.active.update(renderer, seconds, this.commandValue === 'wake'))
    } catch (error) { this.fail(error) }
  }
  private publish(frame: SceneFrame) {
    const models = this.active!.models
    this.host.dataset.sceneFrame = JSON.stringify({ ...frame, reactionDuration: models.reactionDuration,
      pose: models.room.spine.state.getCurrent(1)?.animation?.name,
      touchTrackTime: models.room.spine.state.getCurrent(3)?.trackTime,
      particles: models.foregroundBounds && frame.foregroundAlpha > 0 ? 15 : 0 })
    this.host.dataset.sceneForegroundBounds = JSON.stringify(models.foregroundBounds ?? null)
    this.host.dataset.sceneProtectedAreas = JSON.stringify(this.protectedAreas)
    if (this.lastPhase !== frame.phase) { this.lastPhase = frame.phase; this.callbacks.phase(frame.phase) }
  }
  private fail(error: unknown) { this.app.ticker.stop(); this.callbacks.error(error) }
  private visibility = () => { if (document.hidden) this.app.ticker.stop(); else this.app.ticker.start() }
  dispose() {
    this.disposed = true; this.cancelPending(); this.observer.disconnect()
    document.removeEventListener('visibilitychange', this.visibility)
    this.resolutionMedia?.removeEventListener('change', this.resolutionChanged)
    this.app.ticker.remove(this.update, this); this.active?.dispose(); this.cache.dispose()
    this.app.destroy(true, { children: false })
  }
}
