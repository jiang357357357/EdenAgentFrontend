import { BLEND_MODES, Container, Filter, Graphics, Rectangle, RenderTexture, Sprite, type Renderer } from 'pixi.js'
import type { SceneModels } from './scene-models'
import type { SceneFrame } from './scene-transition'

const toneShader = `precision highp float; varying vec2 vTextureCoord; uniform sampler2D uSampler; uniform float shade; uniform float flash;
void main(){vec4 c=texture2D(uSampler,vTextureCoord);gl_FragColor=vec4(c.rgb*(1.0-shade)+vec3(c.a*flash),c.a);}`
const silhouetteShader = `precision highp float; varying vec2 vTextureCoord; uniform sampler2D uSampler;
void main(){float a=texture2D(uSampler,vTextureCoord).a;gl_FragColor=vec4(vec3(a),a);}`
// The original uses a separable nine-tap kernel on quarter-resolution targets.
const blurShader = `precision highp float; varying vec2 vTextureCoord; uniform sampler2D uSampler; uniform vec4 inputSize; uniform vec4 inputClamp;
uniform vec2 stepSize; uniform float gain; uniform float dim;
vec4 sampleAt(vec2 p){return texture2D(uSampler,clamp(p,inputClamp.xy,inputClamp.zw));}
void main(){vec2 d=stepSize*inputSize.zw;vec4 c=sampleAt(vTextureCoord)*.204164;
c+=(sampleAt(vTextureCoord+d)+sampleAt(vTextureCoord-d))*.180174;
c+=(sampleAt(vTextureCoord+d*2.0)+sampleAt(vTextureCoord-d*2.0))*.123832;
c+=(sampleAt(vTextureCoord+d*3.0)+sampleAt(vTextureCoord-d*3.0))*.066282;
c+=(sampleAt(vTextureCoord+d*4.0)+sampleAt(vTextureCoord-d*4.0))*.027631;
gl_FragColor=vec4(c.rgb*(1.0-dim),c.a)*gain;}`

class SceneBlur {
  readonly filters = [0, 1].map(() => {
    const filter = new Filter(undefined, blurShader, { stepSize: new Float32Array(2), gain: 1, dim: 0 })
    filter.resolution = .25; filter.padding = 32
    return filter
  })
  resolution(value: number) { this.filters.forEach(filter => { filter.resolution = value }) }
  set(radius: number, gain = 1, dim = 0) {
    this.filters.forEach((filter, index) => {
      filter.enabled = radius > 0
      filter.uniforms.stepSize[index] = radius * 4
      filter.uniforms.gain = index ? gain : 1; filter.uniforms.dim = index ? dim : 0
    })
  }
  dispose() { this.filters.forEach(filter => filter.destroy()) }
}

export class SceneEffects {
  readonly background = new Container()
  readonly roomTexture = RenderTexture.create({ width: 1, height: 1 })
  private readonly foregroundTexture = RenderTexture.create({ width: 4, height: 4, resolution: .25 })
  private readonly roomFlash = new Sprite(this.roomTexture)
  private readonly roomHalo = new Sprite(this.roomTexture)
  private readonly foregroundHalo = new Sprite(this.foregroundTexture)
  private readonly particles = new Graphics()
  private readonly roomTone = new Filter(undefined, toneShader, { shade: 0, flash: 0 })
  private readonly foregroundTone = new Filter(undefined, toneShader, { shade: .06, flash: 0 })
  private readonly backgroundBlur = new SceneBlur()
  private readonly haloBlur = [new SceneBlur(), new SceneBlur()]
  private readonly whiteFilters = [0, 1, 2].map(() => new Filter(undefined, silhouetteShader))
  private captured = false
  constructor(private readonly stage: Container, private readonly models: SceneModels, private readonly night: boolean) {
    // Zero inherits the current render target's pixel ratio in Pixi 7. A fixed
    // resolution of one silently downsamples the room and foreground on HiDPI.
    for (const filter of [this.roomTone, this.foregroundTone, ...this.whiteFilters]) {
      filter.resolution = 0; filter.multisample = null
    }
    this.background.addChild(models.roomLayer, this.roomFlash)
    this.background.filters = this.backgroundBlur.filters
    this.roomFlash.filters = [this.whiteFilters[0]]
    this.roomHalo.filters = [this.whiteFilters[1], ...this.haloBlur[0].filters]
    this.foregroundHalo.filters = [this.whiteFilters[2], ...this.haloBlur[1].filters]
    for (const blur of this.haloBlur) blur.set(1.8, .5)
    this.roomHalo.blendMode = this.foregroundHalo.blendMode = BLEND_MODES.ADD
    models.room.spine.filters = [this.roomTone]; models.foregroundLayer.filters = [this.foregroundTone]
    stage.addChild(this.background, models.foregroundLayer, this.roomHalo, this.foregroundHalo, this.particles)
  }
  resize(width: number, height: number, resolution: number) {
    const effectResolution = resolution / 4
    this.roomTexture.setResolution(resolution); this.roomTexture.resize(width, height)
    this.foregroundTexture.setResolution(effectResolution)
    this.foregroundTexture.resize(Math.max(1 / effectResolution, width), Math.max(1 / effectResolution, height))
    this.backgroundBlur.resolution(effectResolution); this.haloBlur.forEach(blur => blur.resolution(effectResolution))
    for (const item of [this.background, this.models.foregroundLayer, this.roomFlash, this.roomHalo, this.foregroundHalo]) {
      item.filterArea = new Rectangle(0, 0, width, height)
    }
    this.captured = false; this.drawParticles(width, height)
  }
  reset() { this.captured = false }
  private drawParticles(width: number, height: number) {
    this.particles.clear().beginFill(this.night ? 0xffc9ff : 0xc3edff)
    for (let index = 0; index < 15; index++) {
      const x = ((.061 + index * .618034) % 1) * width, y = ((.17 + index * .381966) % 1) * height
      const size = Math.min(width, height) * (.012 + .003 * (index % 5))
      const points = [0, 1, 2].flatMap(vertex => {
        const angle = index * 1.71 + vertex * 2.094395
        return [x + Math.cos(angle) * size, y + Math.sin(angle) * size]
      })
      this.particles.drawPolygon(points)
    }
    this.particles.endFill()
  }
  warm(renderer: Renderer) { this.captureForeground(renderer) }
  private captureForeground(renderer: Renderer) {
    const layer = this.models.foregroundLayer, alpha = layer.alpha, visible = layer.visible, filters = layer.filters
    try {
      layer.alpha = 1; layer.visible = true; layer.filters = null
      renderer.render(layer, { renderTexture: this.foregroundTexture, clear: true })
    } finally { layer.alpha = alpha; layer.visible = visible; layer.filters = filters }
  }
  render(renderer: Renderer, frame: SceneFrame) {
    if (frame.exitFlash > 0 && !this.captured) { this.models.captureActor(renderer, this.roomTexture); this.captured = true }
    this.models.actorOpacity(frame.actorAlpha)
    this.roomTone.uniforms.shade = frame.phase === 'room' ? 0 : .18
    this.backgroundBlur.set(1.6 * frame.blur, 1, .2 * frame.blur)
    this.roomFlash.alpha = frame.exitFlash; this.roomHalo.alpha = frame.exitFlash
    this.models.foregroundLayer.alpha = frame.foregroundAlpha
    this.foregroundTone.uniforms.flash = frame.entryFlash
    if (frame.entryFlash > 0 && this.models.foregroundBounds) this.captureForeground(renderer)
    this.foregroundHalo.alpha = this.models.foregroundBounds ? frame.foregroundAlpha * frame.entryFlash : 0
    this.particles.alpha = this.models.foregroundBounds ? frame.foregroundAlpha * .25 : 0
  }
  dispose() {
    this.background.filters = null; this.models.room.spine.filters = null; this.models.foregroundLayer.filters = null
    for (const sprite of [this.roomFlash, this.roomHalo, this.foregroundHalo]) { sprite.filters = null; sprite.destroy() }
    this.particles.destroy(); this.background.removeChildren(); this.background.destroy()
    this.roomTexture.destroy(true); this.foregroundTexture.destroy(true)
    this.roomTone.destroy(); this.foregroundTone.destroy(); this.whiteFilters.forEach(filter => filter.destroy())
    this.backgroundBlur.dispose(); this.haloBlur.forEach(blur => blur.dispose())
  }
}
