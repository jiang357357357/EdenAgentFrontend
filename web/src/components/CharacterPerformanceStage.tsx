import { CircleAlert, CircleHelp, Droplet, Flame, Heart } from "lucide-react"
import { motion, useAnimationControls } from "motion/react"
import { useEffect, type ReactNode } from "react"
import type { ActiveCharacterAction } from "../lib/auth"

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
    case "nod":
      return { rotate: [0, 2.5 * amount, -1.8 * amount, 0], y: [0, 3 * amount, 0] }
    case "bounce":
      return { y: [0, -15 * amount, 0, -7 * amount, 0] }
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
  const className = "h-full w-full"
  if (effect === "question") return <CircleHelp className={className} />
  if (effect === "exclamation") return <CircleAlert className={className} />
  if (effect === "sweat") return <Droplet className={className} />
  if (effect === "heart") return <Heart className={className} />
  if (effect === "anger") return <Flame className={className} />
  return null
}

interface CharacterPerformanceStageProps {
  activeAction?: ActiveCharacterAction
  className: string
  children: ReactNode
}

export function CharacterPerformanceStage({ activeAction, className, children }: CharacterPerformanceStageProps) {
  const effect = activeAction?.effect && activeAction.effect !== "none" ? activeAction.effect : undefined
  const effectKey = `${activeAction?.performanceID ?? activeAction?.time ?? ""}:${effect ?? "none"}`
  const controls = useAnimationControls()

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
            animate={{ opacity: [0, 1, 1, 0], y: [10, -4, -14, -24], scale: [0.72, 1.08, 1, 0.92], rotate: [-8, 4, 0, 0] }}
            transition={{ duration: 1.25, ease: [0.16, 1, 0.3, 1] }}
            className={`pointer-events-none absolute z-20 h-[6vh] w-[6vh] text-accent drop-shadow-[0_6px_12px_rgba(0,0,0,0.18)] ${effectPosition(activeAction?.effectAnchor)}`}
            aria-hidden="true"
          >
            <EffectIcon effect={effect} />
          </motion.div>
        ) : null}
      </div>
    </motion.div>
  )
}
