import type { CSSProperties } from 'react'

const stars = Array.from({ length: 48 }, (_, index) => ({
  left: `${(index * 47 + 7) % 100}%`, top: `${(index * index * 13 + index * 7 + 3) % 72}%`,
  '--star-delay': `${-(index % 9) * .48}s`, '--star-size': index % 9 === 0 ? '2px' : '1px',
  '--star-opacity': index % 9 === 0 ? '.7' : '.32',
}))

export function StartupOpeningArt() {
  return <div className="startup-opening-art" aria-hidden="true">
    <div className="startup-opening-sky" />
    <div className="startup-opening-aurora startup-opening-aurora-far" />
    <div className="startup-opening-aurora" />
    <div className="startup-opening-ribbon"><span /><span /></div>
    <div className="startup-opening-stars">
      {stars.map((style, index) => <span key={index} data-bright={index % 9 === 0} style={style as CSSProperties} />)}
    </div>
    <div className="startup-opening-meteors"><span /><span /></div>
    <div className="startup-opening-horizon" />
    <div className="startup-opening-reflection" />
    <div className="startup-opening-reflection-lines" />
    <div className="startup-opening-water">
      <span /><span /><span /><span />
    </div>
    <div className="startup-opening-vignette" />
  </div>
}
