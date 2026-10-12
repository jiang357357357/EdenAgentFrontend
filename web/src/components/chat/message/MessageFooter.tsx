import { Check, Copy, Trash2 } from "lucide-react"
import { NoticeCard } from "../../feedback"
import { SessionPanelDialog } from "../SessionPanelDialog"
import { ReplyDuration } from "./ReplyDuration"
import { useMessageFooterActions } from "./use-message-footer-actions"

const iconButton = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"

export function MessageDeleteConfirmation({ deleting = false, disabled = false, error, onCancel, onConfirm }: {
  deleting?: boolean; disabled?: boolean; error?: string; onCancel: () => void; onConfirm: () => void
}) {
  return <NoticeCard tone="warning" role="group" title="确定删除这条回答吗？"
    description="这条回答将从聊天记录和模型上下文中移除，用户输入保留，已执行的操作不会撤销。"
    actions={<>
      <button type="button" autoFocus disabled={deleting} onClick={onCancel}
        className="rounded-lg border border-border px-4 py-2 text-text hover:bg-surface-hover disabled:opacity-50">取消</button>
      <button type="button" disabled={deleting || disabled} onClick={onConfirm}
        className="inline-flex items-center gap-2 rounded-lg bg-danger-solid px-4 py-2 text-on-solid hover:opacity-90 disabled:opacity-50">
        <Trash2 aria-hidden="true" className="h-4 w-4" />{deleting ? "删除中…" : "删除"}
      </button>
    </>}>{error ? <NoticeCard tone="error" title="删除失败" description={error} /> : null}</NoticeCard>
}

export function MessageFooter({ durationMs, text, onDelete, deleteDisabled = false }: {
  durationMs?: number; text: string; onDelete?: () => Promise<void>; deleteDisabled?: boolean
}) {
  const action = useMessageFooterActions(text, onDelete)
  const CopyIcon = action.copied ? Check : Copy
  return <div className="mx-[2.05vh] mt-[0.4vh] grid min-w-0 gap-2">
    <div className="flex flex-wrap items-center gap-[0.8vh]">
      <ReplyDuration durationMs={durationMs} className="mr-[0.6vh]" />
      <button type="button" className={iconButton} disabled={action.copying || !text.trim()}
        aria-label={action.copied ? "已复制" : "复制回答"} title={action.copied ? "已复制" : "复制回答"}
        onClick={() => void action.copy()}><CopyIcon aria-hidden="true" className="h-4 w-4" /></button>
      <button type="button" className={iconButton} disabled={!onDelete || deleteDisabled || action.deleting}
        aria-label="删除回答" title={deleteDisabled ? "请等待当前回答结束后再删除" : "删除回答"}
        onClick={action.requestDelete}><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
      <span role="status" className="sr-only">{action.copied ? "回答已复制" : ""}</span>
    </div>
    {action.copyError ? <NoticeCard tone="error" title="复制失败" description={action.copyError} /> : null}
    {action.confirming ? <SessionPanelDialog title="删除回答" dismissible={!action.deleting} onClose={action.cancelDelete}>
      <MessageDeleteConfirmation deleting={action.deleting} disabled={deleteDisabled} error={action.deleteError}
        onCancel={action.cancelDelete} onConfirm={() => void action.remove()} />
    </SessionPanelDialog> : null}
  </div>
}
