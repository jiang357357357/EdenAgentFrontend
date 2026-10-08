import { NoticeCard, noticeActionClass } from "../feedback"
import type { WorkspaceExplorerState } from "./workspace-explorer-state"

const explanations = {
  missing: "原工作区文件夹已不存在，请恢复文件夹或选择其他位置。",
  inaccessible: "当前无法访问工作区，请检查文件夹权限或磁盘连接。",
  invalid: "原工作区路径不可用，请选择有效文件夹。",
  unselected: "选择项目文件夹后，即可浏览文件。",
  ready: "读取文件列表失败，请重试。",
}

export function WorkspaceNotice({ state, onRetry, onChoose, onUseDefault }: {
  state: WorkspaceExplorerState
  onRetry(): void
  onChoose(): void
  onUseDefault(): void
}) {
  const { info, error, busy } = state
  if (!error && (!info || info.status === "ready")) return null
  const unselected = info?.status === "unselected" && !error
  const reason = info?.error || (info ? explanations[info.status] : "暂时无法获取工作区信息。")
  return <NoticeCard className="mx-3 my-3 w-auto" tone={unselected ? "neutral" : "error"}
    title={unselected ? "尚未打开文件夹" : "工作区暂不可用"}
    description={reason}
    actions={<>
      <button type="button" className={noticeActionClass} onClick={onRetry} disabled={busy || state.loading}>重新读取</button>
      <button type="button" className={noticeActionClass} onClick={onChoose} disabled={busy}>重新选择文件夹</button>
      {info?.defaultPath ? <button type="button" className={noticeActionClass} onClick={onUseDefault} disabled={busy}>回到默认工作区</button> : null}
    </>}>
    {info?.path ? <p className="break-all text-xs leading-relaxed text-text-muted">原路径：{info.path}</p> : null}
    {error && error !== reason ? <p className="mt-1 break-words text-xs leading-relaxed text-text-muted">{error}</p> : null}
    {busy ? <p className="mt-1 text-xs text-text-muted">正在更新工作区…</p> : null}
  </NoticeCard>
}
