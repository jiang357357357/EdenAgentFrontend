import { useState } from "react"

export function MobileMessageImage({src, label, sticker}: {src: string; label: string; sticker: boolean}) {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  if (failed) return <button type="button" className="photo-retry" onClick={() => {
    setAttempt(previous => previous + 1)
    setFailed(false)
  }}>图片加载失败，重试</button>
  return <a className={sticker ? "photo-link sticker-link" : "photo-link"} href={`${src}?preview=1&name=${encodeURIComponent(label)}`}
    aria-label={`预览图片：${label}`}>
    <img loading="lazy" decoding="async" draggable={false} className="photo"
      src={attempt ? `${src}?retry=${attempt}` : src} alt={label} onError={() => setFailed(true)} />
  </a>
}
