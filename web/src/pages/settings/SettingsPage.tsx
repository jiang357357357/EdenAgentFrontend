import { useEffect, useRef, useState } from "react"
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react"
import {
  ArrowLeft,
  ArrowUp,
  BatteryMedium,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Keyboard,
  LoaderCircle,
  Menu,
  Minus,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Volume2,
  Wifi,
  X,
} from "lucide-react"
import { motion } from "motion/react"
import { DesktopPetStage } from "../../components/DesktopPetStage"
import {
  resolveCoreAssetUrl,
  type ActiveCharacterAction,
  type CoreAssistant,
} from "../../lib/auth"
import {
  applyDesktopPetSettings,
  closeDesktopWindow,
  DEFAULT_PET_SETTINGS,
  getDesktopEnvironmentPreview,
  getDesktopPetSettings,
  listenDesktopEnvironment,
  listenDesktopPetSettings,
  MIN_PET_CHARACTER_HEIGHT,
  minimizeDesktopWindow,
  resolveDesktopFileUrl,
  toggleMaximizeDesktopWindow,
  type DesktopEnvironmentPreview,
  type PetSettings,
} from "../../lib/desktop-window"
import { cn } from "../../lib/utils"

const screenMotion = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 16 },
}

const transition = {
  duration: 0.22,
  ease: [0.16, 1, 0.3, 1],
} as const

type SettingsSection = "pet" | "input" | "advanced" | "about"
type SaveState = "idle" | "saving" | "saved"

interface SettingsPageProps {
  assistant?: CoreAssistant | null
  assistantError?: string
  activeCharacterAction?: ActiveCharacterAction
  onBack?: () => void
  onOpenAssistantSwitcher?: () => void
}

interface ToggleRowProps {
  label: string
  description: string
  value: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}

interface RangeControlProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  marks?: number[]
  compact?: boolean
  onChange: (value: number) => void
}

const navigationItems: Array<{
  id: SettingsSection
  label: string
  icon: typeof Sparkles
}> = [
  { id: "pet", label: "桌宠", icon: Sparkles },
  { id: "input", label: "对话框", icon: Keyboard },
  { id: "advanced", label: "高级设置", icon: SlidersHorizontal },
  { id: "about", label: "关于", icon: CircleHelp },
]

function PetInputPreview({ opacity, height, fontScale }: { opacity: number; height: number; fontScale: number }) {
  const fontRatio = Math.max(70, Math.min(140, fontScale)) / 100
  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[6cqh] border border-white/15 text-stone-100 shadow-sm backdrop-blur-md"
      style={{
        height: `${Math.max(28, Math.min(50, height + 16))}cqh`,
        backgroundColor: `rgba(28, 25, 23, ${Math.max(30, Math.min(100, opacity)) / 100})`,
      }}
      aria-label="桌宠快捷输入框预览"
    >
      <div className="min-h-0 flex-1 px-[6cqh] py-[5cqh]" style={{ fontSize: `${2 * fontRatio}cqh` }}>
        <p className="text-stone-200">今天需要我做什么？</p>
        <p className="mt-[4cqh] rounded-[3cqh] bg-orange-600/70 px-[4cqh] py-[2cqh] text-right text-white">
          继续优化桌宠交互
        </p>
      </div>
      <div className="flex h-[24%] items-center gap-[3cqh] border-t border-white/12 px-[5cqh]">
        <span className="min-w-0 flex-1 text-stone-400" style={{ fontSize: `${2 * fontRatio}cqh` }}>输入消息…</span>
        <span className="flex aspect-square h-[62%] items-center justify-center rounded-full bg-orange-600 text-white">
          <ArrowUp className="h-[52%] w-[52%]" />
        </span>
      </div>
    </div>
  )
}

function wallpaperStyle(environment: DesktopEnvironmentPreview | null): CSSProperties {
  const fileUrl = resolveDesktopFileUrl(environment?.wallpaper.filePath)
  const mode = environment?.wallpaper.mode ?? "zoom"
  const style: CSSProperties = {
    backgroundColor: environment?.wallpaper.primaryColor || "#1c1917",
    backgroundImage: fileUrl ? `url("${fileUrl}")` : undefined,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  }
  if (mode === "scaled") style.backgroundSize = "contain"
  if (mode === "stretched") style.backgroundSize = "100% 100%"
  if (mode === "centered") style.backgroundSize = "auto"
  if (mode === "wallpaper") {
    style.backgroundRepeat = "repeat"
    style.backgroundSize = "auto"
  }
  return style
}

function DesktopPanelPreview({ environment }: { environment: DesktopEnvironmentPreview }) {
  const [now, setNow] = useState(() => new Date())
  const panel = environment.panel

  useEffect(() => {
    if (!panel) return
    const delay = 60_000 - (Date.now() % 60_000)
    let interval: number | undefined
    const timer = window.setTimeout(() => {
      setNow(new Date())
      interval = window.setInterval(() => setNow(new Date()), 60_000)
    }, delay)
    return () => {
      window.clearTimeout(timer)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [panel])

  if (!panel) return null
  const vertical = panel.position === "left" || panel.position === "right"
  const displaySize = vertical ? environment.displayBounds.width : environment.displayBounds.height
  const thickness = `${(panel.height / Math.max(1, displaySize)) * 100}%`
  const configured = panel.applets.join(" ")
  const positionStyle: CSSProperties = vertical
    ? { top: 0, bottom: 0, width: thickness, [panel.position]: 0 }
    : { left: 0, right: 0, height: thickness, [panel.position]: 0 }
  const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now)

  return (
    <div
      className={cn(
        "absolute z-30 flex items-center justify-between bg-stone-950/88 px-[0.7%] text-white shadow-[0_-0.1cqh_1cqh_rgba(0,0,0,0.28)] backdrop-blur-sm",
        vertical && "flex-col px-0 py-[0.7%]",
        panel.autoHide && "opacity-65",
      )}
      style={positionStyle}
      aria-label={`Cinnamon ${panel.position} panel preview`}
    >
      <div className={cn("flex h-full items-center gap-[0.55cqh]", vertical && "h-auto w-full flex-col")}>
        {configured.includes("menu@cinnamon.org") ? <Menu className="h-[52%] w-auto min-w-0" /> : null}
        {configured.includes("grouped-window-list@cinnamon.org") ? (
          <div className={cn("h-[58%] w-[12%] rounded-sm bg-white/12", vertical && "h-[8%] w-[58%]")} />
        ) : null}
      </div>
      <div className={cn("flex h-full items-center gap-[0.65cqh]", vertical && "h-auto w-full flex-col")}>
        {configured.includes("network@cinnamon.org") ? <Wifi className="h-[42%] w-auto" /> : null}
        {configured.includes("sound@cinnamon.org") ? <Volume2 className="h-[42%] w-auto" /> : null}
        {configured.includes("power@cinnamon.org") ? <BatteryMedium className="h-[42%] w-auto" /> : null}
        {configured.includes("calendar@cinnamon.org") ? (
          <span className="flex items-center gap-[0.25cqh] text-[clamp(0.375rem,1.15cqh,0.75rem)] tabular-nums">
            <Clock3 className="h-[1.45cqh] w-[1.45cqh]" />
            {time}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function ToggleRow({ label, description, value, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-5 border-t border-border px-2 py-2 first:border-t-0">
      <div className="min-w-0 py-3">
        <div className="text-[clamp(0.8125rem,1.45cqh,0.9375rem)] font-medium text-text">{label}</div>
        <div className="mt-1 text-[clamp(0.75rem,1.25cqh,0.8125rem)] leading-5 text-text-muted">{description}</div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-8 w-[3.25rem] shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
          value ? "border-accent bg-accent" : "border-border bg-[#e7e5e4]",
        )}
        aria-label={label}
        aria-pressed={value}
      >
        <span
          className={cn(
            "absolute top-1/2 h-[75%] aspect-square -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left]",
            value ? "left-[46.15%]" : "left-[7.69%]",
          )}
        />
      </button>
    </div>
  )
}

function RangeControl({ label, value, min, max, step = 1, unit = "", marks = [], compact = false, onChange }: RangeControlProps) {
  const progress = ((value - min) / Math.max(1, max - min)) * 100
  return (
    <div className={cn(compact ? "border-t border-border px-[2%] py-[3%]" : "px-2 py-5")}>
      <div className={cn("flex items-center justify-between gap-[4%]", compact ? "mb-[2%]" : "mb-4")}>
        <label className="text-[clamp(0.8125rem,1.45cqh,0.9375rem)] font-medium text-text" htmlFor={`settings-range-${label}`}>
          {label}
        </label>
        <output
          className={cn(
            "text-[clamp(0.75rem,1.25cqh,0.8125rem)] tabular-nums",
            compact
              ? "rounded-full bg-accent-dim px-[3%] py-[1%] font-medium text-accent"
              : "rounded-md border border-border bg-[#fafaf9] px-3 py-1 text-text-muted",
          )}
        >
          {value}
          {unit}
        </output>
      </div>
      <input
        id={`settings-range-${label}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
        style={{ "--range-progress": `${progress}%` } as CSSProperties}
        className="settings-range desktop-no-drag w-full"
        aria-label={label}
      />
      {!compact && marks.length > 0 ? (
        <div className="mt-3 flex justify-between text-xs text-text-muted" aria-hidden="true">
          {marks.map((mark) => (
            <span key={mark} className={mark === value ? "font-medium text-accent" : undefined}>
              {mark}
              {unit}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function RadioRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="flex w-full items-center gap-[6%] rounded-lg px-[4%] py-[4%] text-left transition-colors hover:bg-[#fafaf9] focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
          checked ? "border-accent" : "border-border",
        )}
      >
        {checked ? <span className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
      </span>
      <span className="text-[clamp(0.75rem,1.35cqh,0.875rem)] font-medium text-text">{label}</span>
    </button>
  )
}

function WindowControls() {
  return (
    <div className="desktop-no-drag flex h-full items-stretch">
      <button
        type="button"
        onClick={() => void minimizeDesktopWindow()}
        className="flex w-16 items-center justify-center text-text-muted transition-colors hover:bg-[#f1f0ef] hover:text-text"
        aria-label="最小化"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => void toggleMaximizeDesktopWindow()}
        className="flex w-16 items-center justify-center text-text-muted transition-colors hover:bg-[#f1f0ef] hover:text-text"
        aria-label="最大化或还原"
      >
        <Square className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void closeDesktopWindow()}
        className="flex w-16 items-center justify-center text-text-muted transition-colors hover:bg-red-500 hover:text-white"
        aria-label="关闭"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function SettingsPage({
  assistant,
  assistantError,
  activeCharacterAction,
  onBack,
  onOpenAssistantSwitcher,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("pet")
  const [settings, setSettings] = useState<PetSettings>(DEFAULT_PET_SETTINGS)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [desktopEnvironment, setDesktopEnvironment] = useState<DesktopEnvironmentPreview | null>(null)
  const [previewDragging, setPreviewDragging] = useState(false)
  const hydratedRef = useRef(false)
  const remoteUpdateRef = useRef(false)
  const syncTokenRef = useRef(0)
  const localRevisionRef = useRef(0)
  const previewSurfaceRef = useRef<HTMLDivElement | null>(null)
  const previewDragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startWindowX: number
    startWindowY: number
    surfaceWidth: number
    surfaceHeight: number
  } | null>(null)

  const displayName = assistant?.name || assistant?.character?.name || "白银院 雪音"
  const characterName = assistant?.character?.name || displayName
  const avatarUrl =
    resolveCoreAssetUrl(assistant?.character?.avatar_url || assistant?.character?.default_standing_image_url) || "/favicon-256.png"
  const supportsDynamicStandee = Boolean(assistant?.character?.visual_actions?.some((action) => action.dynamic_preview_url))
  const visualPreference = assistant?.character?.visual_preference === "dynamic" ? "dynamic" : "static"
  const {
    alwaysOnTop,
    transparentWindow,
    clickThrough,
    characterDraggable,
    showInput,
    voiceInputEnabled,
    ttsMode,
    petScale,
    inputOpacity,
    dock,
    windowX,
    windowY,
    inputWidth,
    inputHeight,
    inputFontScale,
  } = settings

  const patchSettings = (patch: Partial<PetSettings>) => {
    localRevisionRef.current += 1
    hydratedRef.current = true
    remoteUpdateRef.current = false
    setSaveState("idle")
    setSettings((current) => ({ ...current, ...patch }))
  }

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    const initialRevision = localRevisionRef.current
    void getDesktopPetSettings().then((nextSettings) => {
      if (!disposed && localRevisionRef.current === initialRevision) {
        remoteUpdateRef.current = true
        setSettings(nextSettings)
        hydratedRef.current = true
      }
    })
    void listenDesktopPetSettings((nextSettings) => {
      if (!disposed) {
        remoteUpdateRef.current = true
        setSettings(nextSettings)
      }
    }).then((cleanup) => {
      unsubscribe = cleanup
      if (disposed) cleanup?.()
    })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void getDesktopEnvironmentPreview().then((nextEnvironment) => {
      if (!disposed) setDesktopEnvironment(nextEnvironment)
    })
    void listenDesktopEnvironment((nextEnvironment) => {
      if (!disposed) setDesktopEnvironment(nextEnvironment)
    }).then((cleanup) => {
      unsubscribe = cleanup
      if (disposed) cleanup?.()
    })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    if (!hydratedRef.current) return
    if (remoteUpdateRef.current) {
      remoteUpdateRef.current = false
      return
    }

    const token = syncTokenRef.current + 1
    syncTokenRef.current = token
    setSaveState("saving")
    const timer = window.setTimeout(() => {
      void applyDesktopPetSettings(settings).then((nextSettings) => {
        if (syncTokenRef.current !== token) return
        remoteUpdateRef.current = true
        setSettings(nextSettings)
        setSaveState("saved")
      })
    }, 120)

    return () => window.clearTimeout(timer)
  }, [settings])

  useEffect(() => {
    if (clickThrough && characterDraggable) {
      patchSettings({ clickThrough: false })
    }
  }, [characterDraggable, clickThrough])

  const reset = () => {
    patchSettings(DEFAULT_PET_SETTINGS)
  }

  const saveLabel = saveState === "saving" ? "正在保存" : saveState === "saved" ? "已保存" : "自动保存"
  const previewInputRatio = showInput ? Math.max(0.28, Math.min(0.5, (inputHeight + 16) / 100)) : 0
  const previewGapRatio = showInput ? 0.04 : 0
  const fallbackPreviewWindowHeight =
    (0.5 * (petScale / 100) * 100) / Math.max(0.12, 1 - previewInputRatio - previewGapRatio)
  const calculatedDesktopPetHeight = desktopEnvironment
    ? Math.round(
        Math.min(
          desktopEnvironment.workArea.height,
          Math.max(MIN_PET_CHARACTER_HEIGHT, desktopEnvironment.workArea.height * 0.5 * (petScale / 100)),
        ) / Math.max(0.12, 1 - previewInputRatio - previewGapRatio),
      )
    : 0
  const calculatedDesktopPetWidth = Math.round(calculatedDesktopPetHeight * (7 / 16))
  const baseDesktopPetHeight = desktopEnvironment
    ? Math.round(
        Math.min(
          desktopEnvironment.workArea.height,
          Math.max(MIN_PET_CHARACTER_HEIGHT, desktopEnvironment.workArea.height * 0.5),
        ) /
          Math.max(0.12, 1 - previewInputRatio - previewGapRatio),
      )
    : 0
  const baseDesktopPetWidth = Math.round(baseDesktopPetHeight * (7 / 16))
  const previewPetScale = baseDesktopPetHeight > 0 ? calculatedDesktopPetHeight / baseDesktopPetHeight : 1
  const previewWindowHeight = Math.min(96, Math.max(36, fallbackPreviewWindowHeight))
  const desktopAspectRatio =
    desktopEnvironment && desktopEnvironment.displayBounds.height > 0
      ? desktopEnvironment.displayBounds.width / desktopEnvironment.displayBounds.height
      : undefined
  const workArea = desktopEnvironment?.workArea
  const displayBounds = desktopEnvironment?.displayBounds
  const fallbackPetX = workArea
    ? dock === "left"
      ? workArea.x + 16
      : dock === "right"
        ? workArea.x + workArea.width - calculatedDesktopPetWidth - 16
        : workArea.x + Math.round((workArea.width - calculatedDesktopPetWidth) / 2)
    : 0
  const fallbackPetY = workArea ? workArea.y + workArea.height - calculatedDesktopPetHeight - 16 : 0
  const petPreviewPlacement =
    displayBounds && displayBounds.width > 0 && displayBounds.height > 0
      ? {
          left: `${(((windowX ?? fallbackPetX) - displayBounds.x) / displayBounds.width) * 100}%`,
          top: `${(((windowY ?? fallbackPetY) - displayBounds.y) / displayBounds.height) * 100}%`,
          width: `${(baseDesktopPetWidth / displayBounds.width) * 100}%`,
          height: `${(baseDesktopPetHeight / displayBounds.height) * 100}%`,
        }
      : undefined

  const startPreviewPetDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!displayBounds || displayBounds.width <= 0 || displayBounds.height <= 0) return
    const surfaceBounds = previewSurfaceRef.current?.getBoundingClientRect()
    if (!surfaceBounds || surfaceBounds.width <= 0 || surfaceBounds.height <= 0) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    previewDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWindowX: windowX ?? fallbackPetX,
      startWindowY: windowY ?? fallbackPetY,
      surfaceWidth: surfaceBounds.width,
      surfaceHeight: surfaceBounds.height,
    }
    setPreviewDragging(true)
  }

  const movePreviewPet = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = previewDragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !displayBounds) return

    event.preventDefault()
    const desktopDeltaX = ((event.clientX - drag.startClientX) / drag.surfaceWidth) * displayBounds.width
    const desktopDeltaY = ((event.clientY - drag.startClientY) / drag.surfaceHeight) * displayBounds.height
    patchSettings({
      windowX: Math.round(drag.startWindowX + desktopDeltaX),
      windowY: Math.round(drag.startWindowY + desktopDeltaY),
    })
  }

  const finishPreviewPetDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = previewDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    previewDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setPreviewDragging(false)
  }

  return (
    <motion.div
      key="settings-control-center"
      {...screenMotion}
      transition={transition}
      className="fixed inset-0 z-10 flex h-screen w-screen flex-col overflow-hidden bg-[#fafaf9] font-sans text-text [container-type:size]"
    >
      <header className="desktop-drag-region flex h-[10%] shrink-0 items-center justify-between border-b border-border bg-white pl-6 xl:pl-9">
        <div className="flex min-w-0 items-center gap-6">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="desktop-no-drag flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-[#f5f5f4] hover:text-accent"
              aria-label="返回"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          <Settings className="h-7 w-7 text-accent xl:h-8 xl:w-8" strokeWidth={2.3} />
          <h1 className="text-[clamp(1.625rem,3cqh,2rem)] font-semibold tracking-tight text-text">设置</h1>
        </div>
        <div className="flex h-full items-center">
          <div className="mr-7 flex items-center gap-2 text-sm text-text-muted xl:mr-16">
            {saveState === "saving" ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
            <span>{saveLabel}</span>
          </div>
          {!onBack ? <div className="h-8 w-[0.0625rem] bg-border" /> : null}
          {!onBack ? <WindowControls /> : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 p-[2%]">
        <div className="grid h-full w-full min-h-0 grid-cols-1 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_0.75cqh_2.8cqh_rgba(41,37,36,0.04)] md:grid-cols-[42%_58%]">
              <section className="flex h-[52vh] min-h-0 flex-col border-b border-border p-[4%] md:h-full md:border-r md:border-b-0">
                <h2 className="mb-4 text-[clamp(0.9375rem,1.65cqh,1.0625rem)] font-semibold text-text">桌宠预览</h2>
                <div
                  ref={previewSurfaceRef}
                  className="relative flex w-full shrink-0 items-start justify-center overflow-hidden border border-[#eadfce] bg-[#eeeae4]"
                  style={{ aspectRatio: desktopAspectRatio ?? 16 / 9 }}
                >
                  {desktopEnvironment && desktopAspectRatio ? (
                    <div className="relative h-full w-full overflow-hidden bg-stone-900 shadow-sm [container-type:size]">
                      <div className="absolute inset-0" style={wallpaperStyle(desktopEnvironment)} aria-label="当前桌面壁纸" />
                      {petPreviewPlacement ? (
                        <div
                          className={cn(
                            "absolute z-20 touch-none select-none overflow-hidden will-change-transform",
                            previewDragging ? "cursor-grabbing" : "cursor-grab",
                          )}
                          style={{
                            ...petPreviewPlacement,
                            transform: `scale(${previewPetScale})`,
                            transformOrigin: "top left",
                          }}
                          aria-label={`${characterName}实时桌宠预览`}
                          title="拖动调整桌宠位置"
                          onPointerDown={startPreviewPetDrag}
                          onPointerMove={movePreviewPet}
                          onPointerUp={finishPreviewPetDrag}
                          onPointerCancel={finishPreviewPetDrag}
                          onDragStart={(event) => event.preventDefault()}
                        >
                          <DesktopPetStage
                            assistant={assistant}
                            assistantError={assistantError}
                            activeCharacterAction={activeCharacterAction}
                            settings={settings}
                            inputCollapsed={false}
                            inputContent={<PetInputPreview opacity={inputOpacity} height={inputHeight} fontScale={inputFontScale} />}
                            preview
                          />
                        </div>
                      ) : null}
                      <DesktopPanelPreview environment={desktopEnvironment} />
                    </div>
                  ) : (
                    <div
                      className="absolute bottom-[2%] left-1/2 -translate-x-1/2 overflow-hidden transition-[height,opacity] duration-200"
                      style={{
                        height: `${previewWindowHeight}%`,
                        aspectRatio: 7 / 16,
                      }}
                    >
                      <DesktopPetStage
                        assistant={assistant}
                        assistantError={assistantError}
                        activeCharacterAction={activeCharacterAction}
                        settings={settings}
                        inputCollapsed={false}
                        inputContent={<PetInputPreview opacity={inputOpacity} height={inputHeight} fontScale={inputFontScale} />}
                        preview
                      />
                    </div>
                  )}
                </div>
                <div className="mt-[3%] shrink-0 border-t border-border pt-[3%]">
                  <h3 className="text-[clamp(0.8125rem,1.45cqh,0.9375rem)] font-medium text-text">位置调整</h3>
                  <div className="mt-[3%] grid grid-cols-2 gap-[3%]">
                    {([
                      ["当前位置 X", windowX, "windowX"],
                      ["当前位置 Y", windowY, "windowY"],
                    ] as const).map(([label, value, key]) => (
                      <label key={key} className="grid min-w-0 gap-[8%] text-sm text-text-muted">
                        {label}
                        <input
                          type="number"
                          value={value ?? ""}
                          placeholder="自动"
                          onChange={(event) => {
                            const raw = event.target.value.trim()
                            const next = Number(raw)
                            patchSettings({ [key]: raw === "" || !Number.isFinite(next) ? null : next })
                          }}
                          className="h-[4.2cqh] w-full min-w-0 rounded-lg border border-border bg-[#fafaf9] px-[6%] text-text outline-none focus:border-accent"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </section>

              <section className="flex h-full min-h-0 flex-col">
                <nav className="grid shrink-0 grid-cols-4 border-b border-border px-[3%]" aria-label="设置分类">
                  {navigationItems.map((item) => {
                    const Icon = item.icon
                    const active = activeSection === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        className={cn(
                          "relative flex items-center justify-center gap-[4%] py-[6%] text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:text-base",
                          active ? "font-medium text-accent" : "text-text-muted hover:text-text",
                        )}
                      >
                        {active ? <span className="absolute inset-x-[10%] bottom-0 h-[4%] rounded-full bg-accent" /> : null}
                        <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.3 : 1.9} />
                        <span className="whitespace-nowrap">{item.label}</span>
                      </button>
                    )
                  })}
                </nav>

                <div className="min-h-0 flex-1 overflow-y-auto px-[4%]">
                {activeSection === "pet" ? (
                  <div>
                <div className="flex items-center justify-between gap-4 py-5">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-[#fff9f1]">
                      <img src={avatarUrl} alt={characterName} className="h-full w-full object-cover object-top" />
                    </div>
                    <div className="min-w-0">
                      <div className="whitespace-nowrap text-sm text-text-muted">当前助手</div>
                      <div className="mt-2 truncate text-lg font-semibold text-text">{displayName}</div>
                      <div className="mt-1 truncate text-sm text-text-muted">聊天当前使用的助手</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenAssistantSwitcher}
                    disabled={!onOpenAssistantSwitcher}
                    className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-accent/45 px-3 text-sm text-accent transition-colors hover:bg-accent-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:px-4"
                  >
                    更换<span className="hidden xl:inline">助手</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="border-t border-border">
                  <RangeControl
                    label="角色缩放"
                    value={petScale}
                    min={70}
                    max={140}
                    unit="%"
                    marks={[70, 100, 120, 140]}
                    onChange={(value) => patchSettings({ petScale: value })}
                  />
                </div>

                <div className="border-t border-border px-2 py-5">
                  <h3 className="mb-3 text-[clamp(0.8125rem,1.45cqh,0.9375rem)] font-medium text-text">立绘模式</h3>
                  <div role="radiogroup" aria-label="立绘模式" className="grid grid-cols-2 gap-[3%]">
                    <RadioRow
                      label="静态立绘"
                      checked={visualPreference === "static"}
                      onChange={() => undefined}
                    />
                    <RadioRow
                      label="动态立绘"
                      checked={visualPreference === "dynamic"}
                      disabled={!supportsDynamicStandee}
                      onChange={() => undefined}
                    />
                  </div>
                </div>

                <div className="border-t border-border">
                  <ToggleRow
                    label="窗口置顶"
                    description="保持桌宠在其他窗口之上"
                    value={alwaysOnTop}
                    onChange={(value) => patchSettings({ alwaysOnTop: value })}
                  />
                  <ToggleRow
                    label="透明背景"
                    description="隐藏桌宠窗口的背景底色"
                    value={transparentWindow}
                    onChange={(value) => patchSettings({ transparentWindow: value })}
                  />
                </div>
                <div className="border-t border-border">
                  <ToggleRow
                    label="点击穿透"
                    description="角色与透明区域穿透，对话框和气泡仍可点击"
                    value={clickThrough}
                    disabled={characterDraggable}
                    onChange={(value) => patchSettings({ clickThrough: value })}
                  />
                  <ToggleRow
                    label="拖动角色移动"
                    description="开启后可按住角色拖动到任意位置"
                    value={characterDraggable}
                    onChange={(value) =>
                      patchSettings(
                        value ? { characterDraggable: true, clickThrough: false } : { characterDraggable: false },
                      )
                    }
                  />
                </div>
                  </div>
                ) : null}

          {activeSection === "input" ? (
            <div className="grid h-full w-full content-start overflow-y-auto px-[4%] pb-[4%] pt-[2%]">
                <ToggleRow
                  label="显示对话框"
                  description="在桌宠上方显示快捷输入区域"
                  value={showInput}
                  onChange={(value) => patchSettings({ showInput: value })}
                />
                {showInput ? (
                  <>
                    <RangeControl compact label="对话框宽度" value={inputWidth} min={10} max={100} unit="%" onChange={(value) => patchSettings({ inputWidth: value })} />
                    <RangeControl compact label="对话框高度" value={inputHeight} min={12} max={32} unit="%" onChange={(value) => patchSettings({ inputHeight: value })} />
                    <RangeControl compact label="字体大小" value={inputFontScale} min={70} max={140} unit="%" onChange={(value) => patchSettings({ inputFontScale: value })} />
                    <RangeControl compact label="对话框不透明度" value={inputOpacity} min={30} max={100} unit="%" onChange={(value) => patchSettings({ inputOpacity: value })} />
                  </>
                ) : null}
            </div>
          ) : null}

          {activeSection === "advanced" ? (
            <div className="grid h-full w-full content-start overflow-y-auto px-[4%] pb-[4%] pt-[2%]">
              <ToggleRow label="开启语音输入" description="允许通过麦克风向当前角色输入消息" value={voiceInputEnabled} onChange={(value) => patchSettings({ voiceInputEnabled: value })} />
              <div className="border-t border-border px-2 py-5">
                <div className="mb-3">
                  <div className="text-[clamp(0.8125rem,1.45cqh,0.9375rem)] font-medium text-text">语音合成范围</div>
                  <div className="mt-1 text-[clamp(0.75rem,1.25cqh,0.8125rem)] leading-5 text-text-muted">使用当前角色关联的 TTS 服务朗读回复</div>
                </div>
                <div role="radiogroup" aria-label="语音合成范围" className="grid grid-cols-3 gap-[2%]">
                  <RadioRow label="关闭" checked={ttsMode === "none"} onChange={() => patchSettings({ ttsMode: "none" })} />
                  <RadioRow label="仅对话" checked={ttsMode === "text_only"} onChange={() => patchSettings({ ttsMode: "text_only" })} />
                  <RadioRow label="全部内容" checked={ttsMode === "all"} onChange={() => patchSettings({ ttsMode: "all" })} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-5 border-t border-border px-2 py-5">
                <div className="min-w-0 py-1">
                  <div className="text-[clamp(0.8125rem,1.45cqh,0.9375rem)] font-medium text-text">恢复默认设置</div>
                  <div className="mt-1 text-[clamp(0.75rem,1.25cqh,0.8125rem)] leading-5 text-text-muted">将所有桌宠参数恢复为初始值</div>
                </div>
                <button type="button" onClick={reset} className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm text-text-muted transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <RotateCcw className="h-4 w-4" />
                  恢复默认
                </button>
              </div>
            </div>
          ) : null}

          {activeSection === "about" ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="w-full rounded-2xl border border-border bg-white px-8 py-10 text-center shadow-[0_0.75cqh_2.8cqh_rgba(41,37,36,0.04)]">
                <img src="/favicon-256.png" alt="MonAgent" className="mx-auto h-20 w-20 object-contain" />
                <h2 className="mt-5 text-2xl font-semibold text-text">MonAgent</h2>
                <p className="mt-2 text-sm text-text-muted">你的本地 AI 伙伴</p>
                <div className="mx-auto mt-6 flex w-[72%] items-start gap-3 rounded-xl bg-[#fafaf9] p-4 text-left text-sm leading-6 text-text-muted">
                  <Bell className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <span>设置会保存在本地，并实时同步到桌宠窗口。</span>
                </div>
              </div>
            </div>
          ) : null}
                </div>
              </section>
            </div>
          </div>

    </motion.div>
  )
}
