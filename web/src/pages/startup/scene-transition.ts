// Timing and easing ported from ShittimLogon-Linux/src/gl_scene.cpp.
export type StartupPhase = 'room' | 'reacting' | 'exit-flash' | 'enter-flash' | 'login' | 'returning'
export type SceneCommand = 'room' | 'wake' | 'login'
export interface SceneFrame {
  phase: StartupPhase; elapsed: number; actorAlpha: number; foregroundAlpha: number
  blur: number; exitFlash: number; entryFlash: number
}
export const smooth = (value: number) => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t) }
const idle = (): SceneFrame => ({ phase: 'room', elapsed: 0, actorAlpha: 1, foregroundAlpha: 0, blur: 0, exitFlash: 0, entryFlash: 0 })

export class SceneTransition {
  private mode: SceneCommand | 'returning' = 'room'
  private age = 0
  private returnAlpha = 0
  private returnBlur = 0
  frame = idle()
  readonly reactionDuration: number
  constructor(reactionDuration: number) { this.reactionDuration = reactionDuration }
  command(value: SceneCommand) {
    if (value === 'room') {
      if (this.mode === 'room' || this.mode === 'returning') return
      this.returnAlpha = this.frame.foregroundAlpha; this.returnBlur = this.frame.blur
      this.mode = 'returning'; this.age = 0
    } else {
      this.mode = value; this.age = value === 'login' ? this.reactionDuration + 1.101 : 0
    }
    this.update(0)
  }
  update(seconds: number): SceneFrame {
    this.age += Math.min(.5, Math.max(0, seconds))
    if (this.mode === 'room') return this.frame = idle()
    if (this.mode === 'returning') return this.returnFrame()
    const exitAge = this.age - this.reactionDuration, entryAge = exitAge - .4
    this.frame = {
      phase: exitAge < 0 ? 'reacting' : entryAge < 0 ? 'exit-flash' : entryAge < .7 ? 'enter-flash' : 'login',
      elapsed: this.age, actorAlpha: exitAge < 0 ? 1 : 0, blur: smooth(exitAge / .4),
      exitFlash: exitAge >= 0 ? Math.max(0, 1 - exitAge / .5) * (216 / 255) : 0,
      foregroundAlpha: smooth(entryAge / .12),
      entryFlash: entryAge >= 0 ? Math.max(0, 1 - entryAge / .5) * (216 / 255) : 0,
    }
    return this.frame
  }
  private returnFrame(): SceneFrame {
    const remaining = 1 - smooth(this.age / .25)
    if (remaining <= 0) { this.mode = 'room'; return this.frame = idle() }
    const foregroundAlpha = this.returnAlpha * remaining
    return this.frame = { phase: 'returning', elapsed: this.age, foregroundAlpha,
      actorAlpha: 1 - foregroundAlpha, blur: this.returnBlur * remaining, exitFlash: 0, entryFlash: 0 }
  }
}
