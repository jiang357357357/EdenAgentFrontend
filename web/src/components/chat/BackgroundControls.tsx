import { ImageOff, ImagePlus, Palette, RotateCcw, Type, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { BackgroundPreference } from "../../lib/use-background-preference"
import { defaultAppearance, type AppearancePreference } from "../../lib/use-appearance-preference"
import { cn } from "../../lib/utils"

interface BackgroundControlsProps {
  value: BackgroundPreference
  ready: boolean
  uploading: boolean
  saving: boolean
  settingError?: string
  appearance: AppearancePreference
  appearanceReady: boolean
  onChange: (value: BackgroundPreference) => void
  onAppearanceChange: (value: AppearancePreference) => void
  onSelectImage: (file: File) => Promise<void>
}

export function BackgroundControls({ value, ready, uploading, saving, settingError, appearance, appearanceReady, onChange, onAppearanceChange, onSelectImage }: BackgroundControlsProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={!ready || !appearanceReady}
        aria-expanded={open}
        aria-label="调整界面外观"
        title="调整界面外观"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          open ? "bg-card text-accent shadow-sm" : "text-text-muted hover:bg-bg hover:text-text",
          (!ready || !appearanceReady) && "cursor-wait opacity-40",
        )}
      >
        <Palette className="h-4 w-4" />
      </button>
      {open ? (
        <div className="appearance-controls absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[80dvh] w-72 overflow-y-auto rounded-xl border border-border bg-card/95 p-4 text-text shadow-xl backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium">界面外观</span>
            <span role="status" title={settingError} className={cn("ml-auto mr-2 text-xs", settingError ? "text-danger" : "text-text-muted")}>{settingError ? "设置失败" : saving ? "正在保存…" : "自动保存"}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-text-muted hover:bg-bg"
              aria-label="关闭外观设置"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <fieldset className="mb-4">
            <legend className="mb-3 text-xs font-medium text-text-muted">整体主题</legend>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["cream", "奶油米色"], ["peach", "暖杏桃色"], ["sage", "清新浅绿"],
                ["lavender", "雾紫暮色"], ["night", "深色夜幕"],
              ] as const).map(([theme, label]) => (
                <button key={theme} type="button" aria-pressed={appearance.baseTheme === theme}
                  onClick={() => onAppearanceChange({ ...appearance, baseTheme: theme, backgroundMode: "theme" })}
                  className={cn("rounded-lg border p-2 text-left text-xs",
                    appearance.baseTheme === theme ? "border-accent bg-accent-dim" : "border-border hover:bg-surface-hover")}>
                  <span data-theme-swatch={theme} className="mb-2 block h-8 rounded-md border border-border/40" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mb-4">
            <legend className="mb-3 text-xs font-medium text-text-muted">主题强调色</legend>
            <div className="grid grid-cols-5 gap-1">
              {([
                ["mist", "雾紫"], ["blue", "晴蓝"], ["mint", "薄荷"],
                ["rose", "玫瑰"], ["amber", "暖金"],
              ] as const).map(([theme, label]) => (
                <button
                  key={theme}
                  type="button"
                  aria-pressed={appearance.accentTheme === theme}
                  onClick={() => onAppearanceChange({ ...appearance, accentTheme: theme })}
                  className={cn("flex flex-col items-center gap-1.5 rounded-lg border py-2 text-xs",
                    appearance.accentTheme === theme ? "border-accent bg-accent-dim text-text" : "border-transparent text-text-muted hover:bg-surface-hover")}
                >
                  <span data-accent-swatch={theme} className="h-5 w-5 rounded-full bg-accent" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-text-muted">
            <Type className="h-3.5 w-3.5" />字体
          </div>
          <Range
            label="聊天正文字体"
            value={appearance.chatFontScale}
            min={80}
            max={140}
            unit="%"
            onChange={(chatFontScale) => onAppearanceChange({ ...appearance, chatFontScale })}
          />
          <Range
            label="组件字体"
            value={appearance.componentFontScale}
            min={80}
            max={140}
            unit="%"
            onChange={(componentFontScale) => onAppearanceChange({ ...appearance, componentFontScale })}
          />
          <div className="mb-3 mt-1 border-t border-border pt-3 text-xs font-medium text-text-muted">背景</div>
          <div className="mb-3 flex gap-2" role="group" aria-label="背景样式">
            {([["theme", "主题渐变"], ["wallpaper", "背景图片"]] as const).map(([mode, label]) => (
              <button key={mode} type="button" aria-pressed={appearance.backgroundMode === mode}
                onClick={() => onAppearanceChange({ ...appearance, backgroundMode: mode })}
                className={cn("flex-1 rounded-md border px-2 py-1.5 text-xs", appearance.backgroundMode === mode ? "border-accent bg-accent-dim text-accent" : "border-border text-text-muted")}>
                {label}
              </button>
            ))}
          </div>
          <fieldset disabled={appearance.backgroundMode !== "wallpaper"} className="disabled:opacity-45">
          <Range
            label="背景图片可见度"
            value={value.opacity}
            max={100}
            unit="%"
            onChange={(opacity) => onChange({ ...value, opacity })}
          />
          <Range
            label="毛玻璃感"
            value={value.blur}
            max={30}
            unit="px"
            onChange={(blur) => onChange({ ...value, blur })}
          />
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void onSelectImage(file)
            }}
          />
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-text-muted hover:bg-bg hover:text-text disabled:cursor-wait disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {uploading ? "正在上传…" : "切换图片"}
            </button>
            <button
              type="button"
              disabled={!value.imageBlobId || uploading}
              onClick={() => onChange({ ...value, imageBlobId: null })}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-text-muted hover:bg-bg hover:text-text disabled:opacity-35"
            >
              <ImageOff className="h-3.5 w-3.5" />
              默认图片
            </button>
          </div>
          </fieldset>
          <button
            type="button"
            onClick={() => {
              onAppearanceChange(defaultAppearance)
              onChange({ ...value, opacity: 100, blur: 0 })
            }}
            className="mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-text-muted hover:bg-bg hover:text-text"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认外观
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Range({
  label,
  value,
  min = 0,
  max,
  unit,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max: number
  unit: string
  onChange: (value: number) => void
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-2 flex justify-between text-xs text-text-muted">
        <span>{label}</span>
        <span>
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-accent"
      />
    </label>
  )
}
