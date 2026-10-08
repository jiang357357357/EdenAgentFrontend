import type { SharedSpace, SharedWorkspaceStatus } from "../../lib/shared-workspace-client"

export const sharedButtonClass = "rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
export const sharedInputClass = "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-text outline-none focus:border-accent disabled:opacity-50"
export const sharedPrimaryButtonClass = "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"

export function sharedSpaceRole(role: SharedSpace["role"]): string {
  return role === "owner" ? "所有者" : role === "editor" ? "可编辑" : "只读"
}

/** A displayed/default workspace is never implicit consent to upload it. */
export function assertShareConsent(root: string, selectedRoot: string, confirmed: boolean): void {
  if (!root || selectedRoot !== root) throw new Error("请先明确选择独立共享目录")
  if (!confirmed) throw new Error("请确认所选目录中的文件将共享给资料库成员")
}

export function sharedWorkspaceLabel(status: SharedWorkspaceStatus | null): string {
  if (!status) return "正在检查共享资料库…"
  if (!status.available) return status.reason || "共享资料库尚不可用"
  if (!status.bound) return "尚未绑定共享目录"
  if (status.paused) return "同步已暂停"
  if (status.state === "syncing") return "正在同步"
  if (status.state === "offline") return "离线，可继续编辑本地文件"
  if (status.conflicts > 0 || status.state === "conflict") return `有 ${status.conflicts} 个冲突待处理`
  if (status.error) return "同步失败，请查看详情"
  if (status.pending > 0) return `有 ${status.pending} 项待同步`
  return status.lastSync ? "已同步" : "等待首次同步"
}

export function sharedTimestamp(value: number | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "尚无记录"
}
