import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import { Check, LoaderCircle, X } from "lucide-react"
import type { ApiMemo } from "../../lib/agent-client"
import {
  fieldClass,
  fullDate,
  kindMeta,
  primaryButton,
  priorityLabels,
  secondaryButton,
  statusMeta,
} from "./memo-presentation"
import type { MemoForm } from "./use-memo-workspace"

interface MemoEditorProps {
  open: boolean
  memo?: ApiMemo
  focusReminder: boolean
  form: MemoForm
  setForm: Dispatch<SetStateAction<MemoForm>>
  saving: boolean
  error: string
  onClose: () => void
  onSave: () => void
}

export function MemoEditor({
  open,
  memo,
  focusReminder,
  form,
  setForm,
  saving,
  error,
  onClose,
  onSave,
}: MemoEditorProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const reminderInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const element = dialog.current!
    if (!element.open) element.showModal()
    ;(focusReminder ? reminderInput.current : titleInput.current)?.focus()
    return () => {
      if (element.open) element.close()
    }
  }, [open, focusReminder])
  const patch = <K extends keyof MemoForm>(key: K, value: MemoForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  return (
    <dialog
      ref={dialog}
      aria-labelledby="memo-editor-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!saving) onClose()
      }}
      className="m-auto max-h-[90dvh] w-[min(54rem,94vw)] max-w-none overflow-hidden rounded-2xl border border-border bg-card p-0 text-text shadow-2xl backdrop:bg-scrim/65"
    >
      {open && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
          className="flex max-h-[90dvh] flex-col"
        >
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 id="memo-editor-title" className="text-lg font-semibold">
                {memo ? "编辑备忘" : "新建备忘"}
              </h2>
              <p className="mt-1 text-xs text-text-muted">写下内容，也可以为它安排一个时间。</p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              aria-label="关闭编辑"
              className="rounded-lg p-2 text-text-muted hover:bg-surface-hover disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <fieldset
            disabled={saving}
            className="surface-scrollbars grid min-h-0 grid-cols-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_14rem]"
          >
            <div className="min-w-0">
              <label className="grid gap-2 text-xs text-text-muted">
                标题
                <input
                  ref={titleInput}
                  required
                  maxLength={1000}
                  value={form.title}
                  onChange={(event) => patch("title", event.target.value)}
                  placeholder="这件事叫什么？"
                  className={fieldClass}
                />
              </label>
              <label className="mt-4 grid gap-2 text-xs text-text-muted">
                正文
                <textarea
                  maxLength={64000}
                  value={form.content}
                  onChange={(event) => patch("content", event.target.value)}
                  placeholder="记录想法、计划或清单，支持 Markdown。"
                  className={`${fieldClass} min-h-64 resize-y leading-7 md:min-h-80`}
                />
              </label>
            </div>
            <aside className="grid content-start gap-4 rounded-xl bg-bg/60 p-4">
              <label className="grid gap-2 text-xs text-text-muted">
                类型
                <select
                  value={form.kind}
                  onChange={(event) => patch("kind", event.target.value as MemoForm["kind"])}
                  className={fieldClass}
                >
                  {Object.entries(kindMeta).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-xs text-text-muted">
                优先级
                <select
                  value={form.priority}
                  onChange={(event) => patch("priority", event.target.value as MemoForm["priority"])}
                  className={fieldClass}
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {memo && (
                <label className="grid gap-2 text-xs text-text-muted">
                  状态
                  <select
                    value={form.status}
                    onChange={(event) => patch("status", event.target.value as MemoForm["status"])}
                    className={fieldClass}
                  >
                    {Object.entries(statusMeta).map(([value, meta]) => (
                      <option key={value} value={value}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="grid gap-2 text-xs text-text-muted">
                提醒时间
                <input
                  ref={reminderInput}
                  type="datetime-local"
                  value={form.remindAt}
                  onChange={(event) => patch("remindAt", event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="grid gap-2 text-xs text-text-muted">
                截止时间
                <input
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={(event) => patch("dueAt", event.target.value)}
                  className={fieldClass}
                />
              </label>
              {memo?.snoozed_until && (
                <p className="text-xs leading-5 text-text-muted">
                  当前延后至 {fullDate(memo.snoozed_until)}。修改时间会替换这次延后安排。
                </p>
              )}
            </aside>
          </fieldset>
          {error && (
            <p
              role="alert"
              className="mx-5 mb-4 rounded-lg border border-danger/30 bg-danger-dim px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" disabled={saving} onClick={onClose} className={secondaryButton}>
              取消
            </button>
            <button type="submit" disabled={saving} className={primaryButton}>
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "正在保存" : "保存备忘"}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  )
}
