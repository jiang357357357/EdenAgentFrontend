import { ArrowRight } from 'lucide-react'
import type { CSSProperties } from 'react'
import { StartupOpeningArt } from './StartupOpeningArt'
import { StartupOpeningEmblem } from './StartupOpeningEmblem'
import { useStartupOpening } from './useStartupOpening'
import './startup-opening.css'

const caption = '我要在那里与你相会。'

export function StartupOpening({ ready, active = true, onComplete }: { ready: boolean; active?: boolean; onComplete(): void }) {
  const { reduced, revealing, skipped, skip } = useStartupOpening(ready, onComplete, active)
  return <div data-startup-opening-overlay data-opening-phase={revealing ? 'revealing' : 'playing'} data-reduced-motion={reduced}
    data-opening-active={active}
    className="startup-opening absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-scrim text-on-solid">
    <StartupOpeningArt />
    <div className="startup-opening-center">
      <StartupOpeningEmblem />
      <div className="startup-opening-message">
        <p role="status" aria-live="polite" aria-label={caption} className="startup-opening-caption">
          <span aria-hidden="true">{Array.from(caption).map((letter, index) =>
            <span key={index} className="startup-opening-letter" style={{ '--letter-delay': `${.58 + index * .035}s` } as CSSProperties}>{letter}</span>)}</span>
        </p>
        <div className="startup-opening-divider" aria-hidden="true"><span /><i /><span /></div>
      </div>
    </div>
    <button type="button" onClick={skip} disabled={!active || revealing || skipped} aria-label="跳过开场动画"
      className="startup-opening-skip absolute flex items-center gap-3 rounded-full px-5 py-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-highlight/80 disabled:opacity-50">
      {skipped ? '正在准备…' : '跳过动画'}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  </div>
}
