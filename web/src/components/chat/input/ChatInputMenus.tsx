import { ShieldAlert } from "lucide-react"

import type { RuntimeModelConfig, RuntimeModelOption } from "../../../lib/agent-client"
import { cn } from "../../../lib/utils"
import type { PermissionMode } from "../../../types"
// 暂时隐藏执行边界设置；当前安装通过 command.execution.set 配置本机执行。
// import { CommandExecutionSettings } from "./CommandExecutionSettings"

export const permissionOptions: Array<{ mode: PermissionMode; label: string; description: string }> = [
  { mode: "restricted", label: "受限审批", description: "写入、命令等操作按授权规则确认" },
  { mode: "full_access", label: "命令审批", description: "自动允许其他工具，终端命令按授权规则确认" },
  { mode: "takeover", label: "完全访问", description: "自动允许工具和终端命令；本机执行时使用当前系统账号权限" },
]

interface ChatInputMenusProps {
  hideComposerFooter: boolean
  modelConfig: RuntimeModelConfig | null
  modelError: string | null
  modelLoading: boolean
  modelMenuOpen: boolean
  modelSubmitting: string | null
  onSelectModel: (option: RuntimeModelOption) => void
  onSelectPermission: (mode: PermissionMode) => void
  overlay: boolean
  permissionMenuOpen: boolean
  permissionMode: PermissionMode
  permissionSubmitting: PermissionMode | null
}

export function ChatInputMenus({
  hideComposerFooter,
  modelConfig,
  modelError,
  modelLoading,
  modelMenuOpen,
  modelSubmitting,
  onSelectModel,
  onSelectPermission,
  overlay,
  permissionMenuOpen,
  permissionMode,
  permissionSubmitting,
}: ChatInputMenusProps) {
  return (
    <>
      {permissionMenuOpen && (
        <div
          role="menu"
          className={cn(
            "absolute z-30 w-[17.5rem] overflow-y-auto rounded-lg border shadow-lg backdrop-blur-md",
            hideComposerFooter ? "bottom-[2.2vh] left-[2.2vh] max-h-[calc(100%-4.4vh)]" : "bottom-[7.3vh] left-[7.6vh] max-h-[65vh]",
            overlay ? "border-white/12 bg-stone-950/88 text-stone-100" : "border-border bg-card text-text",
          )}
        >
          {permissionOptions.map((option) => {
            const active = option.mode === permissionMode
            const saving = permissionSubmitting === option.mode
            return (
              <button
                key={option.mode}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                disabled={permissionSubmitting !== null}
                onClick={() => onSelectPermission(option.mode)}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors disabled:cursor-wait disabled:opacity-70",
                  active
                    ? overlay ? "bg-yellow-300/12 text-[#ffd21f]" : "bg-[#fff8df] text-[#b77900]"
                    : overlay ? "text-stone-300 hover:bg-white/8 hover:text-stone-100" : "text-text-muted hover:bg-bg hover:text-text",
                )}
              >
                <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{saving ? "正在切换..." : option.label}</span>
                  <span className="mt-0.5 block text-xs opacity-75">{option.description}</span>
                </span>
              </button>
            )
          })}
          {/* <CommandExecutionSettings /> */}
        </div>
      )}

      {modelMenuOpen && (
        <div
          role="menu"
          className={cn(
            "absolute z-30 w-[20rem] overflow-y-auto rounded-lg border shadow-lg backdrop-blur-md",
            hideComposerFooter
              ? "bottom-[2.2vh] right-[2.2vh] max-h-[calc(100%-4.4vh)] max-w-[calc(100%-4.4vh)]"
              : "bottom-[7.3vh] right-[8.3vh] max-h-[38vh] max-w-[calc(100%-9rem)]",
            overlay ? "border-white/12 bg-stone-950/88 text-stone-100" : "border-border bg-card text-text",
          )}
        >
          {modelError && <div className={cn("px-3 py-2 text-xs", overlay ? "text-red-100" : "text-red-600")}>{modelError}</div>}
          {modelLoading && !modelConfig ? (
            <div className={cn("px-3 py-3 text-sm", overlay ? "text-stone-300" : "text-text-muted")}>正在读取模型...</div>
          ) : modelConfig?.options.length ? (
            modelConfig.options.map((option) => {
              const saving = modelSubmitting === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.selected}
                  disabled={modelSubmitting !== null}
                  onClick={() => onSelectModel(option)}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors disabled:cursor-wait disabled:opacity-70",
                    option.selected
                      ? overlay ? "bg-white/10 text-stone-50" : "bg-bg text-text"
                      : overlay ? "text-stone-300 hover:bg-white/8 hover:text-stone-100" : "text-text-muted hover:bg-bg hover:text-text",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{saving ? "正在切换..." : option.label}</span>
                    <span className="mt-0.5 block truncate text-xs opacity-75">
                      {option.providerName || option.provider}/{option.modelID}
                      {option.status && option.status !== "active" ? ` · ${option.status}` : ""}
                    </span>
                  </span>
                  {option.selected && <span className="mt-0.5 flex-shrink-0 text-xs opacity-70">当前</span>}
                </button>
              )
            })
          ) : (
            <div className={cn("px-3 py-3 text-sm", overlay ? "text-stone-300" : "text-text-muted")}>没有可用模型</div>
          )}
        </div>
      )}
    </>
  )
}
