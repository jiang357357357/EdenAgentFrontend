import { useId, type ReactNode } from "react"
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from "lucide-react"
import { cn } from "../../lib/utils"
import { noticeSurface, type NoticeTone, type NoticeVariant } from "./notice-styles"

export interface NoticeCardProps {
  tone?: NoticeTone
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  details?: string
  detailsLabel?: string
  icon?: ReactNode
  badge?: ReactNode
  busy?: boolean
  onDismiss?: () => void
  className?: string
  variant?: NoticeVariant
  role?: "status" | "alert" | "group"
}

const iconTone: Record<NoticeTone, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  error: "text-danger",
  neutral: "text-text-muted",
}

export function NoticeCard({ tone = "info", title, description, children, actions, details,
  detailsLabel = "查看详情", icon, badge, busy = false, onDismiss, className,
  variant = "default", role = tone === "error" ? "alert" : "status" }: NoticeCardProps) {
  const titleId = useId()
  const descriptionId = useId()
  const Icon = busy ? LoaderCircle : tone === "success" ? CheckCircle2
    : tone === "warning" || tone === "error" ? AlertTriangle : Info
  const visual = busy || icon === undefined
    ? <Icon className={cn("h-4 w-4", busy && "animate-spin motion-reduce:animate-none")} />
    : icon

  return (
    <section role={role} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
      aria-atomic={role === "group" ? undefined : true}
      className={cn(noticeSurface({ tone, variant }), "p-3 text-sm", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {visual ? <span aria-hidden="true" className={cn("mt-0.5 shrink-0", iconTone[tone])}>{visual}</span> : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 id={titleId} className="min-w-0 break-words font-medium leading-5">{title}</h3>
            {badge ? <span className="max-w-full rounded-full border border-border bg-card/80 px-2 py-0.5 text-xs text-text-muted">{badge}</span> : null}
          </div>
          {description ? <div id={descriptionId} className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-muted">{description}</div> : null}
          {children ? <div className="mt-2">{children}</div> : null}
          {details ? (
            <details className="mt-2 text-xs text-text-muted">
              <summary className="w-fit cursor-pointer rounded-sm py-1 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{detailsLabel}</summary>
              <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-bg/70 p-2 font-mono text-xs leading-relaxed">{details}</pre>
            </details>
          ) : null}
          {actions ? <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        </div>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} aria-label={typeof title === "string" ? `关闭提示：${title}` : "关闭提示"}
            className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </section>
  )
}
