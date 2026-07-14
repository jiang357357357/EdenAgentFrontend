import { motion, useAnimationControls } from "motion/react"
import { useEffect, type ReactNode } from "react"
import type { ActiveCharacterAction } from "../lib/auth"
import { cn } from "../lib/utils"

const effectImagePaths: Record<string, string> = {
  question: "/character-reactions/minimal/question.svg",
  exclamation: "/character-reactions/minimal/exclamation.svg",
  sweat: "/character-reactions/minimal/sweat.svg",
  heart: "/character-reactions/minimal/heart.svg",
  anger: "/character-reactions/minimal/anger.svg",
  sigh: "/character-reactions/minimal/sigh.svg",
  speechless: "/character-reactions/minimal/speechless.svg",
  gloomy: "/character-reactions/minimal/gloomy.svg",
  sleepy: "/character-reactions/minimal/sleepy.svg",
}

const performanceTransition = {
  duration: 0.58,
  ease: [0.16, 1, 0.3, 1],
} as const

function level(activeAction?: ActiveCharacterAction) {
  if (activeAction?.intensity === "light") return 0.72
  if (activeAction?.intensity === "strong") return 1.35
  return 1
}

function motionAnimate(activeAction?: ActiveCharacterAction) {
  const amount = level(activeAction)
  switch (activeAction?.motion) {
    case "jump":
      return { y: [0, -34 * amount, 0], scale: [1, 1.015, 1] }
    case "approach":
      return { y: [0, 8 * amount, 0], scale: [1, 1 + 0.08 * amount, 1] }
    case "retreat":
      return { y: [0, -5 * amount, 0], scale: [1, 1 - 0.07 * amount, 1] }
    case "shake":
      return { x: [0, -8 * amount, 8 * amount, -5 * amount, 5 * amount, 0] }
    case "bounce":
      return { y: [0, -15 * amount, 0, -7 * amount, 0] }
    case "float":
      return { y: [0, -6 * amount, 0, -3 * amount, 0] }
    case "tremble":
      return {
        x: [0, -4 * amount, 4 * amount, -3 * amount, 3 * amount, -2 * amount, 2 * amount, 0],
        rotate: [0, -0.8 * amount, 0.8 * amount, -0.6 * amount, 0.6 * amount, 0],
      }
    case "vertical_shake":
      return { y: [0, -10 * amount, 8 * amount, -6 * amount, 4 * amount, 0] }
    case "sink":
      return { y: [0, 10 * amount, 8 * amount, 0], scale: [1, 0.992, 0.994, 1] }
    case "emphasize":
      return { scale: [1, 1 + 0.09 * amount, 1 + 0.035 * amount, 1] }
    default:
      return { x: 0, y: 0, scale: 1, rotate: 0 }
  }
}

function effectPosition(anchor?: string) {
  switch (anchor) {
    case "head_left":
      return "left-[18%] top-[7%]"
    case "above":
      return "left-1/2 top-[2%] -translate-x-1/2"
    case "body_left":
      return "left-[16%] top-[34%]"
    case "body_right":
      return "right-[16%] top-[34%]"
    case "head_right":
    default:
      return "right-[18%] top-[7%]"
  }
}

function EffectIcon({ effect }: { effect?: string }) {
  const src = effect ? effectImagePaths[effect] : undefined
  return src ? (
    <img
      src={src}
      alt=""
      draggable={false}
      loading="eager"
      decoding="async"
      className="h-full w-full select-none object-contain"
    />
  ) : null
}

interface CharacterPerformanceStageProps {
  activeAction?: ActiveCharacterAction
  className: string
  effectClassName?: string
  children: ReactNode
}

export function CharacterPerformanceStage({ activeAction, className, effectClassName, children }: CharacterPerformanceStageProps) {
  const effect = activeAction?.effect && activeAction.effect !== "none" ? activeAction.effect : undefined
  const effectKey = `${activeAction?.performanceID ?? activeAction?.time ?? ""}:${effect ?? "none"}`
  const controls = useAnimationControls()

  useEffect(() => {
    Object.values(effectImagePaths).forEach((src) => {
      const image = new Image()
      image.src = src
    })
  }, [])

  useEffect(() => {
    void controls.start(motionAnimate(activeAction))
  }, [activeAction?.intensity, activeAction?.motion, activeAction?.performanceID, controls])

  return (
    <motion.div
      className={className}
      animate={controls}
      transition={performanceTransition}
    >
      <div className="relative h-full w-fit">
        {children}
        {effect ? (
          <motion.div
            key={effectKey}
            initial={{ opacity: 0, y: 10, scale: 0.72, rotate: -8 }}
            animate={{ opacity: 1, y: -8, scale: 1, rotate: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "pointer-events-none absolute z-20 drop-shadow-[0_2px_3px_rgba(255,255,255,0.9)] drop-shadow-[0_2px_5px_rgba(0,0,0,0.16)]",
              effectClassName ?? "h-[8vh] w-[8vh]",
              effectPosition(activeAction?.effectAnchor),
            )}
            aria-hidden="true"
          >
            <EffectIcon effect={effect} />
          </motion.div>
        ) : null}
      </div>
    </motion.div>
  )
}
