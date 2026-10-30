import { useId, type CSSProperties } from 'react'

const motes = Array.from({ length: 10 }, (_, index) => {
  const angle = index * Math.PI * .2, radius = 80 + index % 3 * 15
  return { '--mote-x': `${Math.cos(angle) * radius}px`, '--mote-y': `${Math.sin(angle) * radius}px`,
    '--mote-delay': `${.08 + index % 4 * .06}s` } as CSSProperties
})

export function StartupOpeningEmblem() {
  const light = useId()
  const moon = useId()
  return <div className="startup-opening-emblem" aria-hidden="true">
    <div className="startup-opening-motes">{motes.map((style, index) => <span key={index} style={style} />)}</div>
    <svg viewBox="0 0 320 320" fill="none" className="startup-opening-gateway">
      <defs>
        <linearGradient id={light} x1="65" y1="45" x2="240" y2="270" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-opening-glow)" stopOpacity=".08" />
          <stop offset=".6" stopColor="var(--color-opening-glow)" stopOpacity=".65" />
          <stop offset="1" stopColor="var(--color-on-solid)" />
        </linearGradient>
        <linearGradient id={moon} x1="160" y1="30" x2="290" y2="160" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-opening-glow)" stopOpacity=".04" />
          <stop offset=".62" stopColor="var(--color-opening-glow)" stopOpacity=".35" />
          <stop offset="1" stopColor="var(--color-on-solid)" stopOpacity=".88" />
        </linearGradient>
      </defs>
      <circle cx="160" cy="160" r="146" className="startup-opening-ring-dots" />
      <circle cx="160" cy="160" r="130" className="startup-opening-ring-guide" />
      <circle cx="160" cy="160" r="112" className="startup-opening-ring-guide startup-opening-ring-inner" />
      <path d="M160 30A130 130 0 0 1 160 290A105 130 0 0 0 160 30Z" fill={`url(#${moon})`} className="startup-opening-moon" />
      <g className="startup-opening-orbit">
        <circle cx="160" cy="160" r="130" pathLength="1" className="startup-opening-ring-line" strokeDasharray=".72 .28" />
        <path d="M251.92 68.08 A130 130 0 0 1 68.08 251.92" stroke={`url(#${light})`}
          pathLength="1" className="startup-opening-crescent" />
        <path d="M252 240Q254 250 264 252Q254 254 252 264Q250 254 240 252Q250 250 252 240Z" className="startup-opening-satellite" />
        <path d="M68 58Q70 66 78 68Q70 70 68 78Q66 70 58 68Q66 66 68 58Z" className="startup-opening-satellite" />
      </g>
      <g transform="rotate(-28 160 160)"><g className="startup-opening-inner-orbit">
        <ellipse cx="160" cy="160" rx="114" ry="49" pathLength="1" className="startup-opening-ellipse" />
        <circle cx="274" cy="160" r="1.7" className="startup-opening-satellite" />
        <circle cx="46" cy="160" r="2.3" className="startup-opening-satellite" />
      </g></g>
      <g className="startup-opening-symbol">
        <path d="M160 108V212M108 160H212" className="startup-opening-star-ray" />
        <path d="M160 132C163 154 166 157 188 160C166 163 163 166 160 188C157 166 154 163 132 160C154 157 157 154 160 132Z" className="startup-opening-star" />
      </g>
    </svg>
  </div>
}
