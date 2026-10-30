import { SceneModels } from './scene-models'
import type { StartupScene } from './startup-assets'

export const sceneModelKey = (scene: StartupScene) => `${scene.room.skeleton_url}|${scene.character.skeleton_url}`

export class SceneModelCache {
  private readonly entries = new Map<string, SceneModels>()
  private disposed = false
  async load(scene: StartupScene, signal: AbortSignal) {
    const key = sceneModelKey(scene), cached = this.entries.get(key)
    if (cached) return cached
    const models = await SceneModels.load(scene, signal)
    if (this.disposed || signal.aborted) {
      models.dispose(); throw new DOMException('Scene load aborted', 'AbortError')
    }
    this.entries.set(key, models)
    return models
  }
  retain(active?: string, pending?: string) {
    for (const [key, models] of this.entries) {
      if (this.entries.size <= 2) break
      if (key === active || key === pending) continue
      this.entries.delete(key); models.dispose()
    }
  }
  dispose() { this.disposed = true; this.entries.forEach(models => models.dispose()); this.entries.clear() }
}
