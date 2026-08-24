import { useEffect, useState } from "react"
import { ArrowRight, ArrowUpRight, Check } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "../../lib/utils"
import type { RuntimeOrigin } from "../../lib/runtime-origin"

interface OriginSelectionPageProps {
  onSelect: (origin: RuntimeOrigin) => void
}

const choices: Array<{
  origin: RuntimeOrigin
  index: string
  name: string
  action: string
  confirmation: string
  accent: string
}> = [
  {
    origin: "mon",
    index: "01",
    name: "伊甸园",
    action: "连接 Mon",
    confirmation: "确认连接 Mon",
    accent: "text-[#547664]",
  },
  {
    origin: "local",
    index: "02",
    name: "尘世",
    action: "本地部署",
    confirmation: "确认本地部署",
    accent: "text-[#df704b]",
  },
]

export function OriginSelectionPage({ onSelect }: OriginSelectionPageProps) {
  const [selected, setSelected] = useState<RuntimeOrigin | null>(null)

  const handleChoice = (origin: RuntimeOrigin) => {
    if (selected === origin) {
      onSelect(origin)
      return
    }
    setSelected(origin)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault()
        setSelected("mon")
        return
      }
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault()
        setSelected("local")
        return
      }
      if (event.key === "Enter" && selected) {
        event.preventDefault()
        onSelect(selected)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onSelect, selected])

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#f3efe6] px-[clamp(1.4rem,4vw,4.5rem)] pb-[clamp(1.2rem,3vh,2rem)] pt-[clamp(1.5rem,4vh,3rem)] text-[#161616]"
      aria-labelledby="origin-question"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.24] [background-image:radial-gradient(rgba(24,24,24,0.14)_0.65px,transparent_0.65px)] [background-size:5px_5px]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute -right-[12vw] -top-[30vh] h-[64vh] w-[46vw] rounded-full bg-[#b7c9b8]/25 blur-[110px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-[28vh] -left-[10vw] h-[58vh] w-[44vw] rounded-full bg-[#e7a07e]/20 blur-[120px]" />

      <header className="relative z-10 flex items-start justify-between gap-6">
        <div>
          <p className="mb-[clamp(0.5rem,1.4vh,1rem)] text-[clamp(0.68rem,1.15vw,0.9rem)] font-medium uppercase tracking-[0.28em] text-black/42">
            Eden Agent · Origin
          </p>
          <h1
            id="origin-question"
            className="font-serif text-[clamp(3.6rem,9.3vw,8.8rem)] font-semibold leading-[0.86] tracking-[-0.075em]"
          >
            你来自哪里？
          </h1>
        </div>
        <div className="mt-1 hidden items-center gap-2 text-[clamp(0.7rem,1vw,0.85rem)] text-black/40 sm:flex">
          <span className="rounded-md border border-black/15 px-2 py-1">↑</span>
          <span className="rounded-md border border-black/15 px-2 py-1">↓</span>
          <span>选择</span>
          <span className="ml-2 rounded-md border border-black/15 px-2 py-1">Enter</span>
          <span>确认</span>
        </div>
      </header>

      <section className="relative z-10 mt-[clamp(1.4rem,4vh,3rem)] grid min-h-0 flex-1 grid-rows-2 gap-[clamp(0.65rem,1.5vh,1rem)]" aria-label="运行方式">
        {choices.map((choice) => {
          const isSelected = selected === choice.origin
          return (
            <motion.button
              key={choice.origin}
              type="button"
              aria-pressed={isSelected}
              data-origin={choice.origin}
              data-state={isSelected ? "selected" : "idle"}
              onClick={() => handleChoice(choice.origin)}
              whileTap={{ scale: 0.995 }}
              className={cn(
                "group relative grid min-h-[7.25rem] w-full grid-cols-[clamp(4.8rem,14vw,12rem)_1fr_auto] items-center overflow-hidden rounded-[clamp(0.7rem,1.4vw,1.2rem)] border px-[clamp(1rem,2.5vw,2.5rem)] text-left transition-[color,background-color,border-color,box-shadow,transform] duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/20",
                isSelected
                  ? "border-[#161616] bg-[#161616] text-[#f7f2e9] shadow-[0_1.4rem_3.5rem_rgba(24,24,24,0.2)]"
                  : "border-black/30 bg-white/25 text-[#161616] hover:-translate-y-0.5 hover:border-black/70 hover:bg-white/52 hover:shadow-[0_1rem_2.4rem_rgba(24,24,24,0.08)]",
              )}
            >
              <span className={cn(
                "flex items-center gap-[clamp(0.6rem,1.4vw,1.2rem)] font-serif text-[clamp(2.8rem,7vw,6.3rem)] leading-none tracking-[-0.06em] transition-colors duration-300",
                isSelected ? choice.accent : "text-black/42 group-hover:text-black/60",
              )}>
                {isSelected ? (
                  <span className="flex h-[clamp(2.2rem,4vw,3.5rem)] w-[clamp(2.2rem,4vw,3.5rem)] shrink-0 items-center justify-center rounded-full bg-[#f7f2e9] text-[#161616]">
                    <Check className="h-[58%] w-[58%] stroke-[2.5]" />
                  </span>
                ) : null}
                {choice.index}
              </span>

              <span className="font-serif text-[clamp(2.3rem,6.3vw,6rem)] font-semibold leading-none tracking-[-0.06em]">
                {choice.name}
              </span>

              <span className={cn(
                "flex items-center gap-[clamp(0.5rem,1.2vw,1rem)] whitespace-nowrap text-[clamp(1rem,2vw,1.8rem)] font-medium transition-colors",
                choice.accent,
              )}>
                {isSelected ? choice.confirmation : choice.action}
                {choice.origin === "mon" ? (
                  <ArrowUpRight className="h-[1.15em] w-[1.15em] transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                ) : (
                  <ArrowRight className="h-[1.15em] w-[1.15em] transition-transform group-hover:translate-x-1" />
                )}
              </span>

              {isSelected ? (
                <motion.span
                  aria-hidden="true"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    "absolute inset-x-[clamp(1rem,2.5vw,2.5rem)] bottom-[clamp(0.65rem,1.5vh,1rem)] h-px origin-left",
                    choice.origin === "mon" ? "bg-[#6f9b82]" : "bg-[#df704b]",
                  )}
                />
              ) : null}
            </motion.button>
          )
        })}
      </section>

      <footer className="relative z-10 mt-[clamp(0.8rem,2vh,1.4rem)] flex items-center justify-between gap-4 text-[clamp(0.72rem,1.1vw,0.9rem)] text-black/48">
        <p>{selected ? "再次点击已选项，或按 Enter 确认" : "请选择本次登录的运行方式"}</p>
        <p className="text-right">伊甸园连接 Mon · 尘世使用本地运行时</p>
      </footer>
    </motion.main>
  )
}
