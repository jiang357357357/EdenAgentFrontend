import { cn } from "../../lib/utils"

export type NoticeTone = "info" | "success" | "warning" | "error" | "neutral"
export type NoticeVariant = "default" | "overlay"

const surfaces: Record<NoticeTone, string> = {
  info: "border-info/30 bg-info-dim",
  success: "border-success/30 bg-success-dim",
  warning: "border-warning/30 bg-warning-dim",
  error: "border-danger/30 bg-danger-dim",
  neutral: "border-border bg-card",
}

export function noticeSurface({ tone = "info", variant = "default" }: {
  tone?: NoticeTone
  variant?: NoticeVariant
} = {}): string {
  return cn("w-full min-w-0 rounded-xl border text-text shadow-sm", surfaces[tone],
    variant === "overlay" && "bg-overlay/85 shadow-none backdrop-blur-md")
}

export const noticeActionClass = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-accent/40 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
