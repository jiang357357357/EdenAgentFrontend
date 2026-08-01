import { useEffect, useRef, useState } from "react"
import { cn } from "../lib/utils"

interface RenderedImage {
  src: string
  alt: string
}

interface CharacterStandeeImageProps {
  src: string
  alt: string
  className?: string
  imageClassName?: string
  onReady?: () => void
}

export function CharacterStandeeImage({
  src,
  alt,
  className,
  imageClassName,
  onReady,
}: CharacterStandeeImageProps) {
  const [rendered, setRendered] = useState<RenderedImage>({ src, alt })
  const readySrcRef = useRef("")
  const onReadyRef = useRef(onReady)

  onReadyRef.current = onReady

  useEffect(() => {
    if (!src) return
    if (src === rendered.src) {
      if (alt !== rendered.alt) setRendered({ src, alt })
      return
    }

    let cancelled = false
    const image = new Image()

    const showLoadedImage = () => {
      if (!cancelled) setRendered({ src, alt })
    }
    const handleLoaded = () => {
      if (typeof image.decode === "function") {
        void image.decode().then(showLoadedImage).catch(showLoadedImage)
        return
      }
      showLoadedImage()
    }
    image.onload = handleLoaded
    image.onerror = () => {
      if (!cancelled && !rendered.src) setRendered({ src, alt })
    }
    image.src = src

    if (image.complete && image.naturalWidth > 0) handleLoaded()

    return () => {
      cancelled = true
    }
  }, [alt, rendered.alt, rendered.src, src])

  const handleRenderedImageLoad = (image: HTMLImageElement, source: string) => {
    const notifyReady = () => {
      if (readySrcRef.current === source) return
      readySrcRef.current = source
      onReadyRef.current?.()
    }

    if (typeof image.decode === "function") {
      void image.decode().then(notifyReady).catch(notifyReady)
      return
    }
    notifyReady()
  }

  return (
    <img
      src={rendered.src}
      alt={rendered.alt}
      className={cn("h-full w-auto max-w-none object-contain object-bottom", className, imageClassName)}
      draggable={false}
      decoding="async"
      onLoad={(event) => handleRenderedImageLoad(event.currentTarget, rendered.src)}
    />
  )
}
