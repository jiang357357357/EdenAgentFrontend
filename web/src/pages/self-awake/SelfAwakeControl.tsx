import { useId } from "react"
import { AlarmClock, RefreshCw } from "lucide-react"
import { selfAwakeControlState } from "../../lib/self-awake-control-state"
import { useSelfAwakeControl } from "./use-self-awake-control"

export function SelfAwakeControl({ refreshVersion }: { refreshVersion: number }) {
  const { control, error, saving, now, toggle, refresh } = useSelfAwakeControl(refreshVersion)
  const descriptionId = useId()
  const schedule = control?.schedule ?? null
  const { label, issue } = selfAwakeControlState(control, error, now)
  const description = "控制当前账号在此世界的全部角色自醒。关闭后保留待执行计划和历史，已提交的回合继续完成。开启后，到期计划可能立即执行。"

  return (
    <div className="relative min-w-0 max-w-[28vw]">
      <div className="flex items-center gap-[0.65vw] rounded-[0.75vh] border border-accent/20 bg-card px-[1.1vw] py-[0.65vh] text-accent shadow-sm">
        <AlarmClock aria-hidden="true" className="h-[2.4vh] w-[2.4vh] shrink-0" />
        <div className="min-w-0 flex-1" role="status" title={schedule?.reason}>
          <div className="text-[1.25vh] text-text-muted">自动自醒 · 当前世界</div>
          <div className="truncate text-[1.65vh] tabular-nums">{label}</div>
        </div>
        <button type="button" role="switch" aria-label="自动自醒" aria-checked={control?.enabled ?? false}
          aria-busy={saving} aria-describedby={descriptionId} title={description}
          disabled={!control || saving || Boolean(error)} onClick={() => void toggle()}
          className="flex shrink-0 items-center gap-2 rounded-md p-1 text-[1.5vh] outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-50">
          <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${control?.enabled ? "bg-accent" : "bg-border"}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-card shadow-sm transition-transform ${control?.enabled ? "translate-x-[18px]" : "translate-x-0.5"}`} />
          </span>
          {saving ? "保存中" : control ? control.enabled ? "已开启" : "已关闭" : "读取中"}
        </button>
        {error && <button type="button" onClick={refresh} aria-label="重新读取自醒开关" title="刷新开关状态" className="rounded p-1 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent">
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
        </button>}
      </div>
      <p id={descriptionId} className="sr-only">{description}</p>
      {issue && <p role="alert" className="absolute right-0 top-full z-20 mt-2 w-[min(28rem,80vw)] rounded-lg border border-danger/30 bg-card p-3 text-sm text-danger shadow-lg">{issue}</p>}
    </div>
  )
}
