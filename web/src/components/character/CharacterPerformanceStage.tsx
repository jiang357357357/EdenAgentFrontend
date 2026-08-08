import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react"
import { useEffect, useState, type ReactNode } from "react"
import angerEffectUrl from "../../assets/character-reactions/anger.svg"
import exclamationEffectUrl from "../../assets/character-reactions/exclamation.svg"
import gloomyEffectUrl from "../../assets/character-reactions/gloomy.svg"
import heartEffectUrl from "../../assets/character-reactions/heart.svg"
import questionEffectUrl from "../../assets/character-reactions/question.svg"
import sighEffectUrl from "../../assets/character-reactions/sigh.svg"
import sleepyEffectUrl from "../../assets/character-reactions/sleepy.svg"
import speechlessEffectUrl from "../../assets/character-reactions/speechless.svg"
import sweatEffectUrl from "../../assets/character-reactions/sweat.svg"
import type { ActiveCharacterAction } from "../../lib/auth"
import { cn } from "../../lib/utils"

const effectImagePaths: Record<string, string> = {
  question: questionEffectUrl,
  exclamation: exclamationEffectUrl,
  sweat: sweatEffectUrl,
  heart: heartEffectUrl,
  anger: angerEffectUrl,
  sigh: sighEffectUrl,
  speechless: speechlessEffectUrl,
  gloomy: gloomyEffectUrl,
  sleepy: sleepyEffectUrl,
}

const performanceTransition = {
  duration: 0.58,
  ease: [0.16, 1, 0.3, 1],
} as const

interface VisibleEffect {
  effect: string
  key: string
  anchor?: string
}

function effectAnimation(effect: string, reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      visibleMs: 1250,
    }
  }

  switch (effect) {
    case "question":
      return {
        initial: { opacity: 0, y: 10, scale: 0.66, rotate: -14 },
        animate: {
          opacity: [0, 1, 1, 1],
          y: [10, -11, -6, -8],
          scale: [0.66, 1.12, 0.96, 1],
          rotate: [-14, 10, -6, 0],
        },
        exit: { opacity: 0, y: -18, scale: 0.84, rotate: 8 },
        visibleMs: 1900,
      }
    case "exclamation":
      return {
        initial: { opacity: 0, y: 13, scale: 0.5, rotate: -4 },
        animate: {
          opacity: [0, 1, 1, 1],
          y: [13, -14, -6, -8],
          scale: [0.5, 1.28, 0.9, 1],
          rotate: [-4, 3, -2, 0],
        },
        exit: { opacity: 0, y: -20, scale: 0.78 },
        visibleMs: 1550,
      }
    case "sweat":
      return {
        initial: { opacity: 0, y: -13, x: -5, scale: 0.72, rotate: -8 },
        animate: {
          opacity: [0, 1, 1, 1],
          y: [-13, 2, 11, 7],
          x: [-5, 1, 0, 0],
          scale: [0.72, 1.08, 0.96, 1],
          rotate: [-8, 4, -2, 0],
        },
        exit: { opacity: 0, y: 25, scale: 0.78 },
        visibleMs: 1800,
      }
    case "heart":
      return {
        initial: { opacity: 0, y: 11, scale: 0.48, rotate: -9 },
        animate: {
          opacity: [0, 1, 1, 1, 1],
          y: [11, -10, -14, -11, -13],
          scale: [0.48, 1.2, 0.92, 1.1, 1],
          rotate: [-9, 6, -3, 2, 0],
        },
        exit: { opacity: 0, y: -30, scale: 1.12, rotate: 7 },
        visibleMs: 2200,
      }
    case "anger":
      return {
        initial: { opacity: 0, x: 0, y: 7, scale: 0.55, rotate: -10 },
        animate: {
          opacity: [0, 1, 1, 1, 1, 1],
          x: [0, -5, 5, -4, 3, 0],
          y: [7, -8, -8, -8, -8, -8],
          scale: [0.55, 1.18, 1.02, 1.1, 0.98, 1],
          rotate: [-10, -7, 7, -5, 3, 0],
        },
        exit: { opacity: 0, y: -12, scale: 0.75, rotate: 8 },
        visibleMs: 1750,
      }
    case "sigh":
      return {
        initial: { opacity: 0, x: -12, y: 8, scale: 0.72, rotate: -7 },
        animate: {
          opacity: [0, 1, 1, 1],
          x: [-12, -2, 5, 9],
          y: [8, -7, -10, -12],
          scale: [0.72, 1.04, 1, 0.96],
          rotate: [-7, 2, -1, 0],
        },
        exit: { opacity: 0, x: 22, y: -17, scale: 0.82 },
        visibleMs: 1950,
      }
    case "speechless":
      return {
        initial: { opacity: 0, y: 5, scale: 0.75 },
        animate: {
          opacity: [0, 1, 0.72, 1],
          y: [5, -7, -6, -8],
          scale: [0.75, 1.06, 0.98, 1],
          rotate: [0, -2, 2, 0],
        },
        exit: { opacity: 0, y: -3, scale: 0.88 },
        visibleMs: 1900,
      }
    case "gloomy":
      return {
        initial: { opacity: 0, y: -7, scale: 0.7, rotate: 5 },
        animate: {
          opacity: [0, 1, 1, 1],
          y: [-7, 8, 14, 10],
          scale: [0.7, 1.06, 0.97, 1],
          rotate: [5, -4, 2, 0],
        },
        exit: { opacity: 0, y: 25, scale: 0.82, rotate: -5 },
        visibleMs: 2150,
      }
    case "sleepy":
      return {
        initial: { opacity: 0, x: -6, y: 11, scale: 0.65, rotate: -8 },
        animate: {
          opacity: [0, 1, 0.78, 1],
          x: [-6, 1, -2, 5],
          y: [11, -7, -14, -19],
          scale: [0.65, 1.08, 0.94, 1],
          rotate: [-8, 5, -3, 2],
        },
        exit: { opacity: 0, x: 13, y: -34, scale: 0.78, rotate: 9 },
        visibleMs: 2400,
      }
    default:
      return {
        initial: { opacity: 0, y: 10, scale: 0.72, rotate: -8 },
        animate: { opacity: 1, y: -8, scale: 1, rotate: 0 },
        exit: { opacity: 0, y: -18, scale: 0.84 },
        visibleMs: 1800,
      }
  }
}

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
  contentClassName?: string
  effectClassName?: string
  children: ReactNode
}

export function CharacterPerformanceStage({ activeAction, className, contentClassName, effectClassName, children }: CharacterPerformanceStageProps) {
  const effect = activeAction?.effect && activeAction.effect !== "none" ? activeAction.effect : undefined
  const effectKey = `${activeAction?.performanceID ?? activeAction?.time ?? ""}:${effect ?? "none"}`
  const controls = useAnimationControls()
  const reducedMotion = useReducedMotion()
  const [visibleEffect, setVisibleEffect] = useState<VisibleEffect | null>(null)

  useEffect(() => {
    Object.values(effectImagePaths).forEach((src) => {
      const image = new Image()
      image.src = src
    })
  }, [])

  useEffect(() => {
    void controls.start(motionAnimate(activeAction))
  }, [activeAction?.intensity, activeAction?.motion, activeAction?.performanceID, controls])

  useEffect(() => {
    if (!effect) {
      setVisibleEffect(null)
      return
    }

    const nextEffect = {
      effect,
      key: effectKey,
      anchor: activeAction?.effectAnchor,
    }
    setVisibleEffect(nextEffect)
    const timeout = window.setTimeout(() => {
      setVisibleEffect((current) => current?.key === effectKey ? null : current)
    }, effectAnimation(effect, Boolean(reducedMotion)).visibleMs)

    return () => window.clearTimeout(timeout)
  }, [activeAction?.effectAnchor, effect, effectKey, reducedMotion])

  const visibleEffectAnimation = visibleEffect
    ? effectAnimation(visibleEffect.effect, Boolean(reducedMotion))
    : null

  return (
    <motion.div
      className={className}
      animate={controls}
      transition={performanceTransition}
    >
      <div className={cn("relative h-full w-fit", contentClassName)}>
        {children}
        <AnimatePresence>
          {visibleEffect && visibleEffectAnimation ? (
            <motion.div
              key={visibleEffect.key}
              initial={visibleEffectAnimation.initial}
              animate={visibleEffectAnimation.animate}
              exit={visibleEffectAnimation.exit}
              transition={
                reducedMotion
                  ? { duration: 0.18, ease: "easeOut" }
                  : { duration: 0.68, ease: [0.16, 1, 0.3, 1] }
              }
              className={cn(
                "pointer-events-none absolute z-20 drop-shadow-[0_2px_3px_rgba(255,255,255,0.9)] drop-shadow-[0_2px_5px_rgba(0,0,0,0.16)]",
                effectClassName ?? "h-[8vh] w-[8vh]",
                effectPosition(visibleEffect.anchor),
              )}
              aria-hidden="true"
            >
              <EffectIcon effect={visibleEffect.effect} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
