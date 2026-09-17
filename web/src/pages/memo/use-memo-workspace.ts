import { useCallback, useEffect, useRef, useState } from "react"
import {
  archiveMemo,
  completeMemo,
  createMemo,
  listMemos,
  snoozeMemo,
  updateMemo,
  type ApiMemo,
  type ApiMemoKind,
  type ApiMemoPriority,
  type ApiMemoStatus,
} from "../../lib/agent-client"
import { fromDateTimeLocalInputValue, toDateTimeLocalInputValue } from "../../lib/time"
import { memoLimit } from "./memo-presentation"

function emptyForm() {
  return {
    title: "",
    content: "",
    kind: "note" as ApiMemoKind,
    status: "active" as ApiMemoStatus,
    priority: "normal" as ApiMemoPriority,
    remindAt: "",
    dueAt: "",
  }
}
export type MemoForm = ReturnType<typeof emptyForm>

export function useMemoWorkspace() {
  const [memos, setMemos] = useState<ApiMemo[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [editorError, setEditorError] = useState("")
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingMemo, setEditingMemo] = useState<ApiMemo>()
  const [selectedId, setSelectedId] = useState<number>()
  const [form, setForm] = useState(emptyForm)
  const request = useRef(0)
  const mutation = useRef(false)
  const mounted = useRef(false)
  const queryRef = useRef(query)
  queryRef.current = query
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current++
    }
  }, [])

  const refresh = useCallback(async () => {
    const current = ++request.current
    setLoading(true)
    setError("")
    try {
      const data = await listMemos({ q: queryRef.current.trim() || undefined, limit: memoLimit })
      if (mounted.current && current === request.current) setMemos(data)
    } catch (reason) {
      if (mounted.current && current === request.current)
        setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (mounted.current && current === request.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    request.current++
    setLoading(true)
    const timer = window.setTimeout(() => void refresh(), query.trim() ? 220 : 0)
    return () => {
      clearTimeout(timer)
      request.current++
    }
  }, [query, refresh])

  const openCreate = () => {
    if (mutation.current) return
    setEditingMemo(undefined)
    setForm(emptyForm())
    setEditorError("")
    setEditorOpen(true)
  }
  const openEdit = (memo: ApiMemo) => {
    if (mutation.current) return
    setSelectedId(memo.id)
    setEditingMemo(memo)
    setEditorError("")
    setForm({
      title: memo.title,
      content: memo.content ?? "",
      kind: memo.kind,
      status: memo.status,
      priority: memo.priority,
      remindAt: toDateTimeLocalInputValue(memo.remind_at),
      dueAt: toDateTimeLocalInputValue(memo.due_at),
    })
    setEditorOpen(true)
  }
  const closeEditor = () => {
    if (!mutation.current) {
      setEditorOpen(false)
      setEditorError("")
    }
  }

  const save = async () => {
    if (mutation.current) return
    if (!form.title.trim()) {
      setEditorError("请填写标题。")
      return
    }
    if (form.kind === "reminder" && !form.remindAt && !form.dueAt) {
      setEditorError("提醒需要设置提醒时间或截止时间。")
      return
    }
    mutation.current = true
    setSaving(true)
    setEditorError("")
    try {
      const input = {
        title: form.title.trim(),
        content: form.content.trim(),
        kind: form.kind,
        status: form.status,
        priority: form.priority,
        remind_at:
          editingMemo && form.remindAt === toDateTimeLocalInputValue(editingMemo.remind_at)
            ? editingMemo.remind_at
            : fromDateTimeLocalInputValue(form.remindAt),
        due_at:
          editingMemo && form.dueAt === toDateTimeLocalInputValue(editingMemo.due_at)
            ? editingMemo.due_at
            : fromDateTimeLocalInputValue(form.dueAt),
      }
      const scheduleChanged =
        editingMemo &&
        (form.remindAt !== toDateTimeLocalInputValue(editingMemo.remind_at) ||
          form.dueAt !== toDateTimeLocalInputValue(editingMemo.due_at))
      const memo = editingMemo
        ? await updateMemo(editingMemo.id, { ...input, ...(scheduleChanged ? { snoozed_until: null } : {}) })
        : await createMemo({ ...input, status: undefined })
      if (!mounted.current) return
      setSelectedId(memo.id)
      setEditorOpen(false)
      await refresh()
      if (mounted.current) return memo
    } catch (reason) {
      if (mounted.current) setEditorError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      mutation.current = false
      if (mounted.current) setSaving(false)
    }
  }

  const act = async (memo: ApiMemo, action: "complete" | "archive" | "snooze") => {
    if (mutation.current) return
    mutation.current = true
    setSaving(true)
    setError("")
    request.current++ // A list response started before the mutation must not replace its result.
    try {
      const updated =
        action === "complete"
          ? await completeMemo(memo.id)
          : action === "archive"
            ? await archiveMemo(memo.id)
            : await snoozeMemo(memo.id, { minutes: 30 })
      if (!mounted.current) return
      setMemos((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      await refresh()
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      mutation.current = false
      if (mounted.current) {
        setSaving(false)
        setLoading(false)
      }
    }
  }

  return {
    memos,
    query,
    setQuery,
    loading,
    saving,
    error,
    editorError,
    editorOpen,
    editingMemo,
    selectedId,
    setSelectedId,
    form,
    setForm,
    refresh,
    openCreate,
    openEdit,
    closeEditor,
    save,
    act,
  }
}
