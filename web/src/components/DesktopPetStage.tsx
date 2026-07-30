import { MessageCircle, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import type { CSSProperties, ReactNode } from "react"
import { resolveCoreAssetUrl, type ActiveCharacterAction, type CoreAssistant } from "../lib/auth"
import type { PetSettings } from "../lib/desktop-window"
import { cn } from "../lib/utils"
import { CharacterPerformanceStage } from "./CharacterPerformanceStage"
import { CharacterVisualRenderer } from "./CharacterVisualRenderer"

const stageTransition = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
} as const

interface DesktopPetStageProps {
  assistant?: CoreAssistant | null
  assistantError?: string
  activeCharacterAction?: ActiveCharacterAction
  settings: PetSettings
  surface?: "combined" | "character" | "bubble"
  inputCollapsed: boolean
  onInputCollapsedChange?: (collapsed: boolean) => void
  inputContent?: ReactNode
  preview?: boolean
  className?: string
}

export function DesktopPetStage({
  assistant,
  assistantError,
  activeCharacterAction,
  settings,
  surface = "combined",
  inputCollapsed,
  onInputCollapsedChange,
  inputContent,
  preview = false,
  className,
}: DesktopPetStageProps) {
  const character = assistant?.character
  const displayName = assistant?.name || character?.name || "默认助手"
  const activeActionImage =
    activeCharacterAction?.imageUrl ||
    activeCharacterAction?.action?.static_image_url ||
    activeCharacterAction?.action?.dynamic_preview_url ||
    activeCharacterAction?.action?.dynamic_frames?.[0]?.file_url
  const characterImage = resolveCoreAssetUrl(activeActionImage || character?.default_standing_image_url || character?.avatar_url)
  const hasSpine = character?.visual_preference === "spine" && Boolean(character.spine_asset)
  const hasVisual = Boolean(character && (hasSpine || characterImage))
  const characterOnly = surface === "character"
  const bubbleOnly = surface === "bubble"
  const inputEnabled = settings.showInput && !characterOnly
  const inputVisible = inputEnabled && !inputCollapsed
  const inputWidth = Math.max(10, Math.min(100, settings.inputWidth))
  const inputHeight = Math.max(12, Math.min(32, settings.inputHeight))
  const interactionHeight = Math.max(28, Math.min(50, inputHeight + 16))
  const layoutGap = inputEnabled ? 4 : 0
  const characterTop = surface === "combined" && inputEnabled ? interactionHeight + layoutGap : 0
  const characterHeight = 100 - characterTop
  const petBackgroundClass = bubbleOnly || settings.transparentWindow ? "bg-transparent" : "bg-bg"
  const windowDragStyle =
    !preview && !bubbleOnly && settings.characterDraggable ? ({ WebkitAppRegion: "drag" } as CSSProperties) : undefined
  const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties

  return (
    <main
      className={cn(
        "relative h-full w-full select-none overflow-hidden font-sans text-text [container-type:size]",
        petBackgroundClass,
        className,
      )}
      style={windowDragStyle}
    >
      {!preview && !bubbleOnly ? (
        <div
          className="absolute inset-x-0 top-0 z-30 h-[5%]"
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
          aria-hidden="true"
        />
      ) : null}

      {inputEnabled ? (
        <button
          type="button"
          onClick={() => onInputCollapsedChange?.(!inputCollapsed)}
          disabled={!onInputCollapsedChange}
          className={cn(
            "absolute z-30 flex items-center justify-center rounded-full border border-white/25 bg-stone-950/70 text-stone-100 shadow-sm backdrop-blur-md transition-colors hover:bg-stone-900/85 disabled:pointer-events-none",
            bubbleOnly
              ? inputCollapsed
                ? "inset-0 h-full w-full"
                : "right-[3cqh] top-[3cqh] h-[9cqh] w-[9cqh] border-transparent bg-transparent text-stone-300 hover:bg-white/10 hover:text-white"
              : "left-[1.4cqh] h-[4.4cqh] w-[4.4cqh]",
          )}
          style={bubbleOnly ? noDragStyle : { ...noDragStyle, top: `${characterTop + 3}%` }}
          aria-label={inputCollapsed ? "展开聊天框" : "收起聊天框"}
          title={inputCollapsed ? "展开聊天框" : "收起聊天框"}
        >
          {bubbleOnly && !inputCollapsed ? (
            <X className="h-[72%] w-[72%]" />
          ) : (
            <MessageCircle className={bubbleOnly ? "h-[48%] w-[48%]" : "h-[2.3cqh] w-[2.3cqh]"} />
          )}
        </button>
      ) : null}

      {!bubbleOnly ? <section
        className={cn(
          "absolute inset-x-0 flex items-end justify-center text-center",
          !preview && (hasSpine || settings.characterDraggable) ? "pointer-events-auto" : "pointer-events-none",
        )}
        style={{
          top: `${characterTop}%`,
          height: `${characterHeight}%`,
          ...(hasSpine && !preview ? noDragStyle : {}),
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ ...stageTransition, delay: 0.08 }}
          className={cn("relative h-full w-full overflow-hidden shadow-none", petBackgroundClass)}
        >
          {hasVisual && character ? (
            <CharacterPerformanceStage
              activeAction={activeCharacterAction}
              className="absolute inset-x-0 bottom-0 flex h-full justify-center"
              contentClassName={hasSpine ? "w-full" : undefined}
              effectClassName="h-[9.375%] aspect-square"
            >
              <CharacterVisualRenderer
                character={character}
                activeAction={activeCharacterAction}
                displayName={displayName}
                className="relative h-full w-full"
              />
            </CharacterPerformanceStage>
          ) : (
            <div className="flex h-full w-full items-center justify-center px-[8%]">
              <div className="rounded-[3cqh] border border-white/20 bg-white/80 px-[6%] py-[4%] text-center text-stone-700 shadow-sm backdrop-blur">
                <div className="font-serif text-[2.4cqh] text-stone-900">
                  {assistant ? "未配置立绘" : "未绑定默认助手"}
                </div>
                <p className="mt-[1.2cqh] text-[1.5cqh] leading-relaxed text-stone-500">
                  {assistantError ||
                    (assistant ? "请在角色编辑里添加待机动作图片。" : "请在 Core 助手管理里设置默认助手。")}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </section> : null}

      <AnimatePresence>
        {inputVisible && inputContent ? (
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 1 }}
            transition={{ ...stageTransition, delay: 0.14 }}
            className={bubbleOnly ? "absolute inset-0 z-20" : "absolute inset-x-0 top-[4%] z-20 px-[4%]"}
            style={noDragStyle}
          >
            <div className="mx-auto h-full w-full" style={{ maxWidth: bubbleOnly ? "100%" : `${inputWidth}%` }}>
              {inputContent}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  )
}
