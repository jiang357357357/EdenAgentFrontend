import { motion } from "motion/react"
import type { RefObject } from "react"

import type { SlashCommandDefinition } from "../../../lib/slash-commands"
import { cn } from "../../../lib/utils"

interface SlashCommandMenuProps {
  commands: SlashCommandDefinition[]
  menuRef: RefObject<HTMLDivElement | null>
  onExecute: (command: SlashCommandDefinition) => void
  onPointerActiveChange: (active: boolean) => void
  onSelectedIndexChange: (index: number) => void
  optionRefs: RefObject<Array<HTMLButtonElement | null>>
  overlay: boolean
  pointerActive: boolean
  selectedIndex: number
}

export function SlashCommandMenu({
  commands,
  menuRef,
  onExecute,
  onPointerActiveChange,
  onSelectedIndexChange,
  optionRefs,
  overlay,
  pointerActive,
  selectedIndex,
}: SlashCommandMenuProps) {
  return (
    <motion.div
      key="slash-command-menu"
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.99 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      role="listbox"
      aria-label="斜杠命令"
      ref={menuRef}
      onWheel={() => onPointerActiveChange(false)}
      className={cn(
        "absolute inset-x-[2.2vh] bottom-[calc(100%+0.8vh)] z-40 max-h-[42vh] overflow-y-auto rounded-[1.8vh] border p-[0.7vh] shadow-xl backdrop-blur-xl",
        overlay ? "border-white/12 bg-stone-950/92 text-stone-100" : "border-border bg-card/98 text-text",
      )}
    >
      <div className={cn("px-[1.2vh] py-[0.8vh] text-[1.35vh]", overlay ? "text-stone-400" : "text-text-muted")}>命令</div>
      {commands.map((command, index) => {
        const selected = index === selectedIndex
        return (
          <button
            key={command.name}
            ref={(element) => {
              optionRefs.current[index] = element
            }}
            type="button"
            role="option"
            aria-selected={selected}
            onPointerMove={() => {
              onPointerActiveChange(true)
              onSelectedIndexChange(index)
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onExecute(command)}
            className={cn(
              "flex w-full items-center gap-[1.4vh] rounded-[1.25vh] px-[1.2vh] py-[1.05vh] text-left transition-colors",
              selected
                ? overlay ? "bg-white/10 text-white" : "bg-[#fff7e8] text-text"
                : overlay
                  ? cn("text-stone-300", pointerActive && "hover:bg-white/8")
                  : cn("text-text-muted", pointerActive && "hover:bg-bg"),
            )}
          >
            <span className={cn(
              "flex h-[3.3vh] w-[3.3vh] flex-shrink-0 items-center justify-center rounded-[0.9vh] font-mono text-[1.8vh] font-semibold",
              selected ? "bg-accent/12 text-accent" : overlay ? "bg-white/6 text-stone-400" : "bg-bg text-text-muted",
            )}>/</span>
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-[1.65vh] font-medium text-current">/{command.name}</span>
              <span className={cn("mt-[0.2vh] block truncate text-[1.35vh]", selected ? "opacity-70" : "opacity-80")}>{command.description}</span>
            </span>
            {selected && <span className="text-[1.2vh] opacity-55">Enter</span>}
          </button>
        )
      })}
      <div className={cn(
        "mt-[0.45vh] border-t px-[1.2vh] py-[0.8vh] text-[1.15vh]",
        overlay ? "border-white/8 text-stone-500" : "border-border/70 text-text-lighter",
      )}>
        ↑↓ 选择 · Tab 补全 · Enter 执行 · Esc 关闭
      </div>
    </motion.div>
  )
}
