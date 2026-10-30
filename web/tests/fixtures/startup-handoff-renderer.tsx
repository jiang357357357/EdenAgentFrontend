import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Filter } from 'pixi.js'
import { StartupEntrance } from '../../src/pages/startup/StartupEntrance'
import { startupScene } from '../../src/pages/startup/startup-assets'
import type { RuntimeOrigin } from '../../src/lib/runtime-origin'

declare global { interface Window { handoffRoomResolution?: number } }
const apply = Filter.prototype.apply
Filter.prototype.apply = function(manager, input, output, clearMode, state) {
  if ('shade' in this.uniforms && this.uniforms.shade === 0) window.handoffRoomResolution = input.resolution
  return apply.call(this, manager, input, output, clearMode, state)
}
function Harness() {
  const [origin, setOrigin] = useState<RuntimeOrigin | null>(null)
  const [scene] = useState(() => startupScene(12))
  return <StartupEntrance scene={scene} origin={origin} authStatus="unauthenticated" isSubmitting={false}
    onChooseOrigin={setOrigin} onLogin={async () => {}} onContinue={() => {}} />
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
