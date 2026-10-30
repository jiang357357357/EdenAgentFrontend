import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Filter } from 'pixi.js'
import { StartupEntrance } from '../../src/pages/startup/StartupEntrance'
import { startupScene } from '../../src/pages/startup/startup-assets'
import type { RuntimeOrigin } from '../../src/lib/runtime-origin'

const samples: Record<string, unknown> = {}
Object.assign(window, { startupFilterSamples: samples })
const apply = Filter.prototype.apply
Filter.prototype.apply = function (manager, input, output, clearMode, state) {
  if (typeof this.uniforms.shade === 'number') {
    const kind = this.uniforms.shade === .06 ? 'foreground' : 'room'
    samples[kind] = { resolution: input.resolution, activeResolution: state?.resolution,
      width: input.baseTexture.realWidth, height: input.baseTexture.realHeight,
      shade: this.uniforms.shade, configuredResolution: this.resolution }
  }
  return apply.call(this, manager, input, output, clearMode, state)
}
function Harness() {
  const [origin, setOrigin] = useState<RuntimeOrigin | null>(null)
  const [scene] = useState(() => startupScene(Number(new URLSearchParams(location.search).get('hour') ?? 12)))
  return <StartupEntrance scene={scene} origin={origin} authStatus="unauthenticated" isSubmitting={false}
    onChooseOrigin={setOrigin} onLogin={async () => {}} onContinue={() => {}} />
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
